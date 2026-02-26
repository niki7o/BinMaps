import {
  Component, OnInit, OnDestroy, AfterViewInit, inject
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import * as L from 'leaflet';

Chart.register(...registerables);

// ─── Data Interfaces ─────────────────────────────────────────────────────────

interface Bin {
  id: number;
  areaId: string;
  trashType: number;
  fillPercentage: number;
  temperature: number | null;
  hasSensor: boolean;
  status: string | null;
  locationX: number;  // longitude
  locationY: number;  // latitude
}

interface Cluster {
  id: number;
  centLat: number;
  centLng: number;
  bins: Bin[];
  avgFill: number;
  maxFill: number;
  hasFire: boolean;
  riskScore: number;
  dominantZone: string;
}

interface ZoneStat {
  name: string;
  avgFill: number;
  total: number;
  critical: number;
  onFire: number;
  loadScore: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

@Component({
  selector: 'app-analytics-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './analytics-dashboard.component.html',
  styleUrls: ['./analytics-dashboard.component.css']
})
export class AnalyticsDashboardComponent implements OnInit, AfterViewInit, OnDestroy {

  private http         = inject(HttpClient);
  private hotspotMap!: L.Map;
  private hotspotLayers: L.Layer[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private mapReady     = false;
  private chartsReady  = false;
  private fillChart?:  Chart;
  private typeChart?:  Chart;
  private zoneChart?:  Chart;

  // ── Public state ──────────────────────────────────────────────────────────

  mapLayer: 'all' | 'critical' = 'all';

  stats = {
    totalBins:      0,
    avgFill:        0,
    criticalBins:   0,
    onFireCount:    0,
    sensorCoverage: 0,
    mostLoadedZone: '—',
    estimatedRoutes: 0,
    lastUpdated:    '—'
  };

  routeEfficiency  = 0;
  clusters: Cluster[]  = [];
  zoneStats: ZoneStat[] = [];

  get criticalClusters() { return this.clusters.filter(c => c.avgFill >= 60); }

  get routeEfficiencyColor() {
    if (this.routeEfficiency >= 72) return '#10b981';
    if (this.routeEfficiency >= 48) return '#f59e0b';
    return '#ef4444';
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit() {
    this.fetch();
    this.timer = setInterval(() => this.fetch(), 60_000);
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.initMap();
      this.initCharts();
      this.chartsReady = true;
    }, 80);
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.hotspotMap) this.hotspotMap.remove();
    this.fillChart?.destroy();
    this.typeChart?.destroy();
    this.zoneChart?.destroy();
  }

  // ── Data ──────────────────────────────────────────────────────────────────

  private fetch() {
    this.http.get<Bin[]>('https://localhost:7277/api/containers').subscribe({
      next:  bins => this.process(bins),
      error: err  => console.error('Analytics fetch error', err)
    });
  }

  private process(bins: Bin[]) {
    this.computeKPIs(bins);
    this.buildZoneStats(bins);
    this.clusters        = this.clusterBins(bins);
    this.routeEfficiency = this.computeRouteEfficiency(bins);
    if (this.mapReady)    this.redrawHeatmap();
    if (this.chartsReady) {
      this.updateFillChart(bins);
      this.updateTypeChart(bins);
      this.updateZoneChart();
    }
  }

  // ── KPI Computation ───────────────────────────────────────────────────────

  private computeKPIs(bins: Bin[]) {
    const n = bins.length;
    if (!n) return;

    const avgFill    = bins.reduce((s, b) => s + b.fillPercentage, 0) / n;
    const critical   = bins.filter(b => b.fillPercentage > 80).length;
    const onFire     = bins.filter(b =>
      b.status === 'Fire' || (b.temperature != null && b.temperature > 50)
    ).length;
    const withSensor = bins.filter(b => b.hasSensor).length;

    const zoneAvg: Record<string, number[]> = {};
    bins.forEach(b => (zoneAvg[b.areaId] ??= []).push(b.fillPercentage));
    const sorted = Object.entries(zoneAvg)
      .map(([z, arr]) => ({ z, avg: arr.reduce((a, v) => a + v, 0) / arr.length }))
      .sort((a, b) => b.avg - a.avg);

    this.stats = {
      totalBins:       n,
      avgFill:         Math.round(avgFill),
      criticalBins:    critical,
      onFireCount:     onFire,
      sensorCoverage:  Math.round((withSensor / n) * 100),
      mostLoadedZone:  sorted[0]?.z ?? '—',
      estimatedRoutes: Math.max(1, Math.ceil(critical / 8)),
      lastUpdated:     new Date().toLocaleTimeString('bg-BG')
    };
  }

  private buildZoneStats(bins: Bin[]) {
    const map: Record<string, { fills: number[]; critical: number; onFire: number }> = {};
    bins.forEach(b => {
      if (!map[b.areaId]) map[b.areaId] = { fills: [], critical: 0, onFire: 0 };
      map[b.areaId].fills.push(b.fillPercentage);
      if (b.fillPercentage > 80) map[b.areaId].critical++;
      if (b.status === 'Fire' || (b.temperature != null && b.temperature > 50))
        map[b.areaId].onFire++;
    });

    this.zoneStats = Object.entries(map)
      .map(([name, d]) => {
        const avg       = d.fills.reduce((s, v) => s + v, 0) / d.fills.length;
        const loadScore = Math.min(100, Math.round(avg + (d.critical / d.fills.length) * 20));
        return { name, avgFill: Math.round(avg), total: d.fills.length,
                 critical: d.critical, onFire: d.onFire, loadScore };
      })
      .sort((a, b) => b.loadScore - a.loadScore);
  }

  // ── Proximity Clustering ──────────────────────────────────────────────────

  private clusterBins(bins: Bin[], thresholdM = 350): Cluster[] {
    const clusters: Cluster[] = [];

    for (const bin of bins) {
      let best: Cluster | null = null;
      let bestDist = Infinity;

      for (const c of clusters) {
        const d = this.haversine(c.centLat, c.centLng, bin.locationY, bin.locationX);
        if (d < thresholdM && d < bestDist) { bestDist = d; best = c; }
      }

      if (best) {
        best.bins.push(bin);
        // Update weighted centroid
        best.centLat = best.bins.reduce((s, b) => s + b.locationY, 0) / best.bins.length;
        best.centLng = best.bins.reduce((s, b) => s + b.locationX, 0) / best.bins.length;
      } else {
        clusters.push({
          id: clusters.length, centLat: bin.locationY, centLng: bin.locationX,
          bins: [bin], avgFill: 0, maxFill: 0, hasFire: false,
          riskScore: 0, dominantZone: bin.areaId
        });
      }
    }

    // Compute per-cluster stats
    clusters.forEach(c => {
      const fills    = c.bins.map(b => b.fillPercentage);
      c.avgFill      = fills.reduce((s, v) => s + v, 0) / fills.length;
      c.maxFill      = Math.max(...fills);
      c.hasFire      = c.bins.some(
        b => b.status === 'Fire' || (b.temperature != null && b.temperature > 50)
      );
      // Risk score is purely fill-density based (no temperature)
      const critRatio  = c.bins.filter(b => b.fillPercentage > 80).length / c.bins.length;
      const heavyRatio = c.bins.filter(b => b.fillPercentage > 60).length / c.bins.length;
      c.riskScore      = Math.min(100, Math.round(
        c.avgFill * 0.72 + critRatio * 18 + heavyRatio * 10
      ));

      const zoneCounts: Record<string, number> = {};
      c.bins.forEach(b => zoneCounts[b.areaId] = (zoneCounts[b.areaId] || 0) + 1);
      c.dominantZone = Object.entries(zoneCounts).sort((a, b) => b[1] - a[1])[0][0];
    });

    return clusters.sort((a, b) => b.riskScore - a.riskScore);
  }

  private haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R  = 6_371_000;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;
    const a  = Math.sin(Δφ / 2) ** 2
             + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ── Route Efficiency ──────────────────────────────────────────────────────

  private computeRouteEfficiency(bins: Bin[]): number {
    const critical = bins.filter(b => b.fillPercentage > 60);
    if (critical.length < 2) return 91;

    const nnDist = this.nearestNeighborDist(critical);
    const lats   = critical.map(b => b.locationY);
    const lngs   = critical.map(b => b.locationX);
    const diag   = this.haversine(
      Math.min(...lats), Math.min(...lngs),
      Math.max(...lats), Math.max(...lngs)
    );
    const worstCase = diag * critical.length * 0.65;
    if (worstCase === 0) return 91;

    const raw = Math.max(0, 1 - nnDist / worstCase);
    return Math.min(95, Math.max(22, Math.round(32 + raw * 60)));
  }

  private nearestNeighborDist(bins: Bin[]): number {
    if (bins.length < 2) return 0;
    const visited = new Set<number>([0]);
    let current = bins[0], total = 0;

    while (visited.size < bins.length) {
      let ni = -1, nd = Infinity;
      for (let i = 0; i < bins.length; i++) {
        if (!visited.has(i)) {
          const d = this.haversine(
            current.locationY, current.locationX,
            bins[i].locationY, bins[i].locationX
          );
          if (d < nd) { nd = d; ni = i; }
        }
      }
      if (ni === -1) break;
      total += nd; current = bins[ni]; visited.add(ni);
    }
    return total;
  }

  // ── Map ───────────────────────────────────────────────────────────────────

  private initMap() {
    const el = document.getElementById('hotspot-map');
    if (!el) return;

    this.injectMapStyles();

    this.hotspotMap = L.map('hotspot-map', {
      center:            [42.6977, 23.3219],
      zoom:              12,
      zoomControl:       true,
      scrollWheelZoom:   false,
      attributionControl: false
    });

    // CartoDB dark tiles for premium look
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      opacity:    0.92,
      subdomains: 'abcd',
      maxZoom:    19
    }).addTo(this.hotspotMap);

    // Force Leaflet to recalculate container size after CSS renders
    setTimeout(() => { this.hotspotMap.invalidateSize(); }, 250);

    this.mapReady = true;

    // Load initial data for map
    this.http.get<Bin[]>('https://localhost:7277/api/containers').subscribe(bins => {
      this.clusters = this.clusterBins(bins);
      setTimeout(() => {
        this.hotspotMap.invalidateSize();
        this.redrawHeatmap();
      }, 300);
    });
  }

  /** Public so template buttons can call it */
  redrawHeatmap() {
    this.hotspotLayers.forEach(l => this.hotspotMap.removeLayer(l));
    this.hotspotLayers = [];

    const visible = this.mapLayer === 'critical'
      ? this.clusters.filter(c => c.riskScore >= 55)
      : this.clusters;

    for (const c of visible) {
      // Color based purely on fill density — traffic heatmap style
      // green (empty) → yellow (half-full) → orange (heavy) → red (critical) → deep red (max)
      const color = c.avgFill >= 88 ? '#dc2626'
                  : c.avgFill >= 73 ? '#ef4444'
                  : c.avgFill >= 57 ? '#f97316'
                  : c.avgFill >= 38 ? '#f59e0b'
                  : c.avgFill >= 20 ? '#84cc16'
                  : '#10b981';

      // ① Outer glow — large soft halo
      const outerR  = 160 + c.bins.length * 55 + (c.avgFill / 100) * 180;
      const outer   = L.circle([c.centLat, c.centLng], {
        radius:      outerR,
        color:       color,
        fillColor:   color,
        fillOpacity: 0.04 + (c.riskScore / 100) * 0.07,
        weight:      0
      }).addTo(this.hotspotMap);
      this.hotspotLayers.push(outer);

      // ② Mid fill — main body of the hotspot
      const midR    = 70 + (c.avgFill / 100) * 150 + c.bins.length * 18;
      const mid     = L.circle([c.centLat, c.centLng], {
        radius:      midR,
        color:       color,
        fillColor:   color,
        fillOpacity: 0.15 + (c.riskScore / 100) * 0.22,
        weight:      c.hasFire ? 1.5 : 0.5,
        dashArray:   c.hasFire ? '5 5' : undefined
      }).addTo(this.hotspotMap);
      this.hotspotLayers.push(mid);

      // ③ Core dot — dense center
      const coreR   = 22 + c.bins.length * 7;
      const core    = L.circle([c.centLat, c.centLng], {
        radius:      coreR,
        color:       color,
        fillColor:   color,
        fillOpacity: 0.7,
        weight:      0
      }).addTo(this.hotspotMap);
      this.hotspotLayers.push(core);

      // ④ Pulsing marker for heavily-filled clusters
      if (c.avgFill >= 65 || c.hasFire) {
        const icon = L.divIcon({
          className: '',
          html: `<div class="an-pulse" style="--pc:${color}">
                   <div class="an-pulse__ring"></div>
                   <div class="an-pulse__core" style="background:${color};box-shadow:0 0 10px ${color}"></div>
                 </div>`,
          iconSize:   [40, 40],
          iconAnchor: [20, 20]
        });
        const marker = L.marker([c.centLat, c.centLng], { icon }).addTo(this.hotspotMap);
        this.hotspotLayers.push(marker);
      }

      // ⑤ Tooltip — fill-density focused
      const nearFull  = c.bins.filter(b => b.fillPercentage > 80).length;
      const halfFull  = c.bins.filter(b => b.fillPercentage > 50 && b.fillPercentage <= 80).length;
      const fireTag   = c.hasFire
        ? `<div style="color:#f87171;font-weight:700;margin-top:4px">🔥 Пожарна опасност!</div>`
        : '';
      mid.bindTooltip(`
        <div class="an-tooltip">
          <div class="an-tt-hdr">Клъстер #${c.id + 1}</div>
          <div class="an-tt-zone">${c.dominantZone}</div>
          <div class="an-tt-grid">
            <div class="an-tt-cell"><span>Кофи</span><b>${c.bins.length}</b></div>
            <div class="an-tt-cell"><span>Ср. запълване</span><b style="color:${color}">${c.avgFill.toFixed(0)}%</b></div>
            <div class="an-tt-cell"><span>Пълни &gt;80%</span><b style="color:#ef4444">${nearFull}</b></div>
            <div class="an-tt-cell"><span>50–80%</span><b style="color:#f59e0b">${halfFull}</b></div>
          </div>
          ${fireTag}
        </div>
      `, { sticky: true, opacity: 1, className: 'an-lft-tip' });
    }
  }

  setMapLayer(layer: 'all' | 'critical') {
    this.mapLayer = layer;
    if (this.mapReady) this.redrawHeatmap();
  }

  private injectMapStyles() {
    const id = 'an-injected-styles';
    if (document.getElementById(id)) return;

    const s = document.createElement('style');
    s.id    = id;
    s.textContent = `
      .an-pulse {
        width:40px; height:40px; display:flex; align-items:center; justify-content:center; position:relative;
      }
      .an-pulse__ring {
        position:absolute; width:100%; height:100%; border-radius:50%;
        background:var(--pc); opacity:0;
        animation: an-pulse-anim 2.2s ease-out infinite;
      }
      .an-pulse__core {
        width:13px; height:13px; border-radius:50%; z-index:1; position:relative;
      }
      @keyframes an-pulse-anim {
        0%   { transform:scale(0.35); opacity:0.9; }
        100% { transform:scale(2.4);  opacity:0;   }
      }
      .an-lft-tip.leaflet-tooltip {
        background: rgba(8,12,24,0.97) !important;
        border: 1px solid rgba(255,255,255,0.10) !important;
        border-radius: 12px !important;
        padding: 12px 16px !important;
        box-shadow: 0 12px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) !important;
        color: #e2e8f0 !important;
        font-size: 13px !important;
        font-family: 'Inter', sans-serif !important;
      }
      .an-lft-tip.leaflet-tooltip-top::before,
      .an-lft-tip.leaflet-tooltip-bottom::before { border-top-color: rgba(8,12,24,0.97) !important; }
      .an-tooltip { min-width: 180px; }
      .an-tt-hdr  { font-size:15px; font-weight:800; color:#fff; margin-bottom:2px; }
      .an-tt-zone { font-size:11px; color:#64748b; letter-spacing:.06em; text-transform:uppercase; margin-bottom:8px; }
      .an-tt-grid { display:grid; grid-template-columns:1fr 1fr; gap:4px 8px; }
      .an-tt-cell { display:flex; flex-direction:column; gap:1px; }
      .an-tt-cell span { font-size:10px; color:#64748b; }
      .an-tt-cell b    { font-size:13px; font-weight:700; color:#e2e8f0; }
    `;
    document.head.appendChild(s);
  }

  // ── Charts ────────────────────────────────────────────────────────────────

  private initCharts() {
    const fillEl = document.getElementById('fillChart') as HTMLCanvasElement | null;
    const typeEl = document.getElementById('typeChart') as HTMLCanvasElement | null;
    const zoneEl = document.getElementById('zoneChart') as HTMLCanvasElement | null;
    if (!fillEl || !typeEl || !zoneEl) return;

    const tick  = { color: 'rgba(226,232,240,0.6)', font: { family: "'Inter', sans-serif", size: 11 as const } };
    const grid  = { color: 'rgba(255,255,255,0.05)' };
    const bord  = { color: 'transparent' };

    this.fillChart = new Chart(fillEl, {
      type: 'bar',
      data: {
        labels: ['0–20%', '20–40%', '40–60%', '60–80%', '80–100%'],
        datasets: [{
          label: 'Контейнери',
          data:  [0, 0, 0, 0, 0],
          backgroundColor: ['#10b981', '#34d399', '#f59e0b', '#f97316', '#ef4444'],
          borderRadius: 7,
          borderSkipped: false as const
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: tick, grid, border: bord },
          y: { beginAtZero: true, ticks: tick, grid, border: bord }
        }
      }
    });

    this.typeChart = new Chart(typeEl, {
      type: 'doughnut',
      data: {
        labels: ['Смесен', 'Пластмаса', 'Хартия', 'Стъкло'],
        datasets: [{
          data: [0, 0, 0, 0],
          backgroundColor: ['#6366f1', '#3b82f6', '#10b981', '#f59e0b'],
          hoverOffset:  14,
          borderWidth:  3,
          borderColor:  'rgba(10,15,28,0.9)'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: 'rgba(226,232,240,0.7)', font: { family: "'Inter', sans-serif", size: 11 }, padding: 14, usePointStyle: true }
          }
        },
        cutout: '68%'
      }
    });

    this.zoneChart = new Chart(zoneEl, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          { label: 'Ср. запълване %', data: [], backgroundColor: 'rgba(59,130,246,0.85)', borderRadius: 5 },
          { label: 'Критични',         data: [], backgroundColor: 'rgba(239,68,68,0.85)',  borderRadius: 5 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: 'rgba(226,232,240,0.7)', font: { family: "'Inter', sans-serif", size: 11 }, usePointStyle: true } }
        },
        scales: {
          x: { ticks: tick, grid, border: bord },
          y: { beginAtZero: true, ticks: tick, grid, border: bord }
        }
      }
    });
  }

  private updateFillChart(bins: Bin[]) {
    if (!this.fillChart) return;
    const b = [0, 0, 0, 0, 0];
    bins.forEach(bin => b[Math.min(4, Math.floor(bin.fillPercentage / 20))]++);
    this.fillChart.data.datasets[0].data = b;
    this.fillChart.update('none');
  }

  private updateTypeChart(bins: Bin[]) {
    if (!this.typeChart) return;
    const sums = [0, 0, 0, 0], counts = [0, 0, 0, 0];
    bins.forEach(b => {
      const t = b.trashType;
      if (t >= 0 && t < 4) { sums[t] += b.fillPercentage; counts[t]++; }
    });
    this.typeChart.data.datasets[0].data = sums.map((s, i) => counts[i] ? Math.round(s / counts[i]) : 0);
    this.typeChart.update('none');
  }

  private updateZoneChart() {
    if (!this.zoneChart) return;
    this.zoneChart.data.labels            = this.zoneStats.map(z => z.name.replace('Зона ', 'З.'));
    this.zoneChart.data.datasets[0].data  = this.zoneStats.map(z => z.avgFill);
    this.zoneChart.data.datasets[1].data  = this.zoneStats.map(z => z.critical);
    this.zoneChart.update('none');
  }

  // ── Template Helpers ──────────────────────────────────────────────────────

  getRiskClass(s: number) { return s >= 70 ? 'risk-high' : s >= 45 ? 'risk-medium' : 'risk-low'; }
  getRiskLabel(s: number) { return s >= 70 ? 'Критична'  : s >= 45 ? 'Умерена'     : 'Нормална'; }

  getFillColor(f: number) {
    return f >= 80 ? '#ef4444' : f >= 60 ? '#f97316' : f >= 40 ? '#f59e0b' : '#10b981';
  }

  getGaugeOffset(): number {
    const C = 2 * Math.PI * 46; // circumference ≈ 289
    return C * (1 - this.routeEfficiency / 100);
  }
}
