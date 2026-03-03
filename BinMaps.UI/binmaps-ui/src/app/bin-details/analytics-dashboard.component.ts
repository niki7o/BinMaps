import {
  Component, OnInit, OnDestroy, AfterViewInit, inject
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import { environment } from '../../environments/environment';

Chart.register(...registerables);

interface Bin {
  id: number;
  areaId: string;
  trashType: number;
  fillPercentage: number;
  temperature: number | null;
  hasSensor: boolean;
  status: string | null;
  locationX: number;
  locationY: number;
}

interface Cluster {
  id: number;
  centLat: number;
  centLng: number;
  bins: Bin[];
  avgFill: number;
  maxFill: number;
  minFill: number;
  hasFire: boolean;
  riskScore: number;
  dominantZone: string;
}

interface ZoneStat {
  name: string;
  avgFill: number;
  total: number;
  critical: number;
  heavy: number;
  onFire: number;
  loadScore: number;
}

@Component({
  selector: 'app-analytics-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './analytics-dashboard.component.html',
  styleUrls: ['./analytics-dashboard.component.css']
})
export class AnalyticsDashboardComponent implements OnInit, AfterViewInit, OnDestroy {

  private http = inject(HttpClient);

  private hotspotMap!: L.Map;
  private hotspotLayers: L.Layer[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private initTimer?: ReturnType<typeof setTimeout>;
  private invalidateTimer?: ReturnType<typeof setTimeout>;
  private mapReady = false;
  private chartsReady = false;

  

private fillChart?: Chart<'bar'>;
private typeChart?: Chart<'doughnut'>;
private zoneChart?: Chart<'bar'>;

  mapLayer: 'all' | 'critical' = 'all';
  dataLoaded = false;

  stats = {
    totalBins: 0,
    avgFill: 0,
    criticalBins: 0,
    heavyBins: 0,
    onFireCount: 0,
    sensorCoverage: 0,
    mostLoadedZone: '—',
    clusterCount: 0,
    lastUpdated: '—'
  };

  routeEfficiency = 0;
  clusters: Cluster[] = [];
  zoneStats: ZoneStat[] = [];

  get criticalClusters() { return this.clusters.filter(c => c.avgFill >= 60); }

  get gaugeColor() {
    if (this.routeEfficiency >= 70) return '#10b981';
    if (this.routeEfficiency >= 45) return '#f59e0b';
    return '#ef4444';
  }

  get routeEfficiencyColor() { return this.gaugeColor; }

  ngOnInit() {
    this.timer = setInterval(() => {
      if (this.mapReady && this.chartsReady) this.fetch();
    }, 60000);
  }

  ngAfterViewInit() {
    this.initTimer = setTimeout(() => {
      this.initMap();
      this.initCharts();
      this.chartsReady = true;
      this.fetch();
    }, 150);
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.initTimer) clearTimeout(this.initTimer);
    if (this.invalidateTimer) clearTimeout(this.invalidateTimer);
    if (this.hotspotMap) this.hotspotMap.remove();
    this.fillChart?.destroy();
    this.typeChart?.destroy();
    this.zoneChart?.destroy();
    document.getElementById('an-injected-styles')?.remove();
  }

  private fetch() {
    this.http.get<Bin[]>(`${environment.apiUrl}/containers`).subscribe({
      next: bins => this.process(bins),
      error: err => console.error('[Analytics] fetch error:', err)
    });
  }

  private process(bins: Bin[]) {
    if (!bins?.length) return;

    this.computeKPIs(bins);
    this.buildZoneStats(bins);
    this.clusters = this.clusterBins(bins);
    this.routeEfficiency = this.computeRouteEfficiency(bins);
    this.dataLoaded = true;

    if (this.mapReady) this.redrawHeatmap();
    if (this.chartsReady) {
      this.updateFillChart(bins);
      this.updateTypeChart(bins);
      this.updateZoneChart();
    }
  }

  private computeKPIs(bins: Bin[]) {
    const n = bins.length;
    if (!n) return;

    const avgFill = bins.reduce((s, b) => s + b.fillPercentage, 0) / n;

    const critical = bins.filter(b => b.fillPercentage > 80).length;
    const heavy = bins.filter(b => b.fillPercentage > 60 && b.fillPercentage <= 80).length;
    const onFire = bins.filter(b =>
      b.status === 'Fire' || (b.temperature != null && b.temperature > 50)
    ).length;
    const withSensor = bins.filter(b => b.hasSensor).length;

    const zoneAvg: Record<string, number[]> = {};
    bins.forEach(b => (zoneAvg[b.areaId] ??= []).push(b.fillPercentage));

    const topZone = Object.entries(zoneAvg)
      .map(([z, arr]) => ({ z, avg: arr.reduce((a, v) => a + v, 0) / arr.length }))
      .sort((a, b) => b.avg - a.avg)[0];

    this.stats = {
      totalBins: n,
      avgFill: Math.round(avgFill),
      criticalBins: critical,
      heavyBins: heavy,
      onFireCount: onFire,
      sensorCoverage: Math.round((withSensor / n) * 100),
      mostLoadedZone: topZone?.z ?? '—',
      clusterCount: 0,
      lastUpdated: new Date().toLocaleTimeString('bg-BG')
    };
  }

  private buildZoneStats(bins: Bin[]) {
    const map: Record<string, { fills: number[]; critical: number; heavy: number; onFire: number }> = {};

    bins.forEach(b => {
      (map[b.areaId] ??= { fills: [], critical: 0, heavy: 0, onFire: 0 });
      map[b.areaId].fills.push(b.fillPercentage);

      if (b.fillPercentage > 80) map[b.areaId].critical++;
      if (b.fillPercentage > 60 && b.fillPercentage <= 80) map[b.areaId].heavy++;
      if (b.status === 'Fire' || (b.temperature != null && b.temperature > 50)) map[b.areaId].onFire++;
    });

    this.zoneStats = Object.entries(map).map(([name, d]) => {
      const avg = d.fills.reduce((s, v) => s + v, 0) / d.fills.length;
      const n = d.fills.length;

      const loadScore = Math.min(100, Math.round(
        avg * 0.6 +
        (d.critical / n) * 30 +
        (d.heavy / n) * 10 +
        (d.onFire > 0 ? 15 : 0)
      ));

      return {
        name,
        avgFill: Math.round(avg),
        total: n,
        critical: d.critical,
        heavy: d.heavy,
        onFire: d.onFire,
        loadScore
      };
    }).sort((a, b) => b.loadScore - a.loadScore);
  }

  private clusterBins(bins: Bin[], thresholdM = 1500): Cluster[] {
    const clusters: Cluster[] = [];

    for (const bin of bins) {
      let best: Cluster | null = null;
      let bestDist = Infinity;

      for (const c of clusters) {
        const d = this.haversine(c.centLat, c.centLng, bin.locationY, bin.locationX);
        if (d < thresholdM && d < bestDist) {
          bestDist = d;
          best = c;
        }
      }

      if (best) {
        best.bins.push(bin);
        best.centLat = best.bins.reduce((s, b) => s + b.locationY, 0) / best.bins.length;
        best.centLng = best.bins.reduce((s, b) => s + b.locationX, 0) / best.bins.length;
      } else {
        clusters.push({
          id: clusters.length,
          centLat: bin.locationY,
          centLng: bin.locationX,
          bins: [bin],
          avgFill: 0,
          maxFill: 0,
          minFill: 0,
          hasFire: false,
          riskScore: 0,
          dominantZone: bin.areaId
        });
      }
    }

    this.stats.clusterCount = clusters.length;

    clusters.forEach(c => {
      const fills = c.bins.map(b => b.fillPercentage);
      c.avgFill = fills.reduce((s, v) => s + v, 0) / fills.length;
      c.maxFill = Math.max(...fills);
      c.minFill = Math.min(...fills);

      c.hasFire = c.bins.some(
        b => b.status === 'Fire' || (b.temperature != null && b.temperature > 50)
      );

      const n = c.bins.length;
      const critRatio = c.bins.filter(b => b.fillPercentage > 80).length / n;
      const heavyRatio = c.bins.filter(b => b.fillPercentage > 60).length / n;

      c.riskScore = Math.min(100, Math.round(
        c.avgFill * 0.68 +
        critRatio * 20 +
        heavyRatio * 12
      ));

      const zc: Record<string, number> = {};
      c.bins.forEach(b => zc[b.areaId] = (zc[b.areaId] || 0) + 1);
      c.dominantZone = Object.entries(zc).sort((a, b) => b[1] - a[1])[0][0];
    });

    return clusters.sort((a, b) => b.riskScore - a.riskScore);
  }

  private haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private computeRouteEfficiency(bins: Bin[]): number {
    const critical = bins.filter(b => b.fillPercentage > 60);
    if (critical.length < 2) return 90;

    const nnDist = this.nearestNeighborDist(critical);

    const lats = critical.map(b => b.locationY);
    const lngs = critical.map(b => b.locationX);

    const diag = this.haversine(
      Math.min(...lats), Math.min(...lngs),
      Math.max(...lats), Math.max(...lngs)
    );

    const worstCase = diag * critical.length * 0.6;
    if (!worstCase) return 90;

    const ratio = Math.max(0, 1 - nnDist / worstCase);

    return Math.min(95, Math.max(20, Math.round(30 + ratio * 62)));
  }

  private nearestNeighborDist(bins: Bin[]): number {
    if (bins.length < 2) return 0;

    const visited = new Set<number>([0]);
    let current = bins[0];
    let total = 0;

    while (visited.size < bins.length) {
      let ni = -1;
      let nd = Infinity;

      for (let i = 0; i < bins.length; i++) {
        if (!visited.has(i)) {
          const d = this.haversine(
            current.locationY, current.locationX,
            bins[i].locationY, bins[i].locationX
          );
          if (d < nd) {
            nd = d;
            ni = i;
          }
        }
      }

      if (ni < 0) break;

      total += nd;
      current = bins[ni];
      visited.add(ni);
    }

    return total;
  }

  private initMap() {
    const el = document.getElementById('hotspot-map');
    if (!el) return;

    this.injectMapStyles();

    this.hotspotMap = L.map('hotspot-map', {
      center: [42.6977, 23.3219],
      zoom: 12,
      zoomControl: true,
      scrollWheelZoom: false,
      attributionControl: false
    });

    L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png').addTo(this.hotspotMap);

    this.invalidateTimer = setTimeout(() => {
      if (this.hotspotMap && document.getElementById('hotspot-map')) {
        this.hotspotMap.invalidateSize();
      }
      this.mapReady = true;
    }, 200);
  }

  redrawHeatmap() {
    if (!this.hotspotMap) return;

    this.hotspotLayers.forEach(l => this.hotspotMap.removeLayer(l));
    this.hotspotLayers = [];

    const visible = this.mapLayer === 'critical'
      ? this.clusters.filter(c => c.avgFill >= 55)
      : this.clusters;

    for (const c of visible) {
      const color = c.avgFill >= 88 ? '#dc2626'
        : c.avgFill >= 73 ? '#ef4444'
        : c.avgFill >= 57 ? '#f97316'
        : c.avgFill >= 38 ? '#f59e0b'
        : c.avgFill >= 20 ? '#84cc16'
        : '#10b981';

      const n = c.bins.length;

      const outer = L.circle([c.centLat, c.centLng], {
        radius: 300 + n * 80 + (c.avgFill / 100) * 400,
        color,
        fillColor: color,
        fillOpacity: 0.05 + (c.avgFill / 100) * 0.08,
        weight: 0
      }).addTo(this.hotspotMap);

      this.hotspotLayers.push(outer);

      const midCircle = L.circle([c.centLat, c.centLng], {
        radius: 120 + n * 45 + (c.avgFill / 100) * 260,
        color,
        fillColor: color,
        fillOpacity: 0.18 + (c.avgFill / 100) * 0.22,
        weight: c.hasFire ? 1.5 : 0.6,
        dashArray: c.hasFire ? '6 4' : undefined
      }).addTo(this.hotspotMap);

      this.hotspotLayers.push(midCircle);

      const core = L.circle([c.centLat, c.centLng], {
        radius: 30 + n * 10,
        color,
        fillColor: color,
        fillOpacity: 0.72,
        weight: 0
      }).addTo(this.hotspotMap);

      this.hotspotLayers.push(core);

      if (c.avgFill >= 60 || c.hasFire) {
        const icon = L.divIcon({
          className: '',
          html: `<div class="an-pulse"><div class="an-pulse__ring"></div><div class="an-pulse__core" style="background:${color};box-shadow:0 0 10px ${color}"></div></div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        });

        const pulse = L.marker([c.centLat, c.centLng], { icon }).addTo(this.hotspotMap);
        this.hotspotLayers.push(pulse);
      }

      const pctAbove80 = c.bins.filter(b => b.fillPercentage > 80).length;
      const pct60to80 = c.bins.filter(b => b.fillPercentage > 60 && b.fillPercentage <= 80).length;

      midCircle.bindTooltip(`
        <div>
          <div>Zone ${c.dominantZone}</div>
          <div>Bins ${n}</div>
          <div>Fill ${c.avgFill.toFixed(0)}%</div>
        </div>
      `, { sticky: true });
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
    s.id = id;

    s.textContent = `
      .an-pulse { width:40px;height:40px;display:flex;align-items:center;justify-content:center;position:relative; }
      .an-pulse__ring { position:absolute;width:100%;height:100%;border-radius:50%;background:var(--pc);opacity:0;animation:an-pulse-anim 2.2s ease-out infinite; }
      .an-pulse__core { width:13px;height:13px;border-radius:50%;z-index:1;position:relative; }
      @keyframes an-pulse-anim { 0%{transform:scale(.35);opacity:.9} 100%{transform:scale(2.4);opacity:0} }
    `;

    document.head.appendChild(s);
  }

  private initCharts() {
    const fillEl = document.getElementById('fillChart') as HTMLCanvasElement | null;
    const typeEl = document.getElementById('typeChart') as HTMLCanvasElement | null;
    const zoneEl = document.getElementById('zoneChart') as HTMLCanvasElement | null;

    if (!fillEl || !typeEl || !zoneEl) return;

    const tick = { color: 'rgba(226,232,240,.55)', font: { family: "'Inter',sans-serif", size: 11 as const } };
    const grid = { color: 'rgba(255,255,255,.05)' };
    const bord = { color: 'transparent' };

    this.fillChart = new Chart(fillEl, {
      type: 'bar',
      data: {
        labels: ['0–20%', '20–40%', '40–60%', '60–80%', '80–100%'],
        datasets: [{
          label: 'Bins',
          data: [0, 0, 0, 0, 0],
          backgroundColor: ['#10b981', '#34d399', '#f59e0b', '#f97316', '#ef4444'],
          borderRadius: 7,
          borderSkipped: false as const
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
  x: {
    ticks: tick,
    grid: grid
  },
  y: {
    beginAtZero: true,
    ticks: tick,
    grid: grid
  }
}
      }
    });

    this.typeChart = new Chart(typeEl, {
      type: 'doughnut',
      data: {
        labels: ['Mixed', 'Plastic', 'Paper', 'Glass'],
        datasets: [{
          data: [0, 0, 0, 0],
          backgroundColor: ['#6366f1', '#3b82f6', '#10b981', '#f59e0b'],
          hoverOffset: 14,
          borderWidth: 3,
          borderColor: 'rgba(10,15,28,.9)'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        cutout: '68%'
      }
    });

    this.zoneChart = new Chart(zoneEl, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          { label: 'Avg Fill %', data: [], backgroundColor: 'rgba(59,130,246,.82)', borderRadius: 5 },
          { label: 'Critical', data: [], backgroundColor: 'rgba(239,68,68,.82)', borderRadius: 5 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
  x: {
    ticks: tick,
    grid: grid
  },
  y: {
    beginAtZero: true,
    ticks: tick,
    grid: grid
  }
}
      }
    });
  }

  private updateFillChart(bins: Bin[]) {
    if (!this.fillChart) return;
    const buckets = [0, 0, 0, 0, 0];
    bins.forEach(b => buckets[Math.min(4, Math.floor(b.fillPercentage / 20))]++);
    this.fillChart.data.datasets[0].data = buckets;
    this.fillChart.update('none');
  }

  private updateTypeChart(bins: Bin[]) {
    if (!this.typeChart) return;

    const sums = [0, 0, 0, 0];
    const counts = [0, 0, 0, 0];

    bins.forEach(b => {
      const t = b.trashType;
      if (t >= 0 && t < 4) { sums[t] += b.fillPercentage; counts[t]++; }
    });

    this.typeChart.data.datasets[0].data =
      sums.map((s, i) => counts[i] > 0 ? Math.round(s / counts[i]) : 0);

    this.typeChart.update('none');
  }

  private updateZoneChart() {
    if (!this.zoneChart) return;

    this.zoneChart.data.labels = this.zoneStats.map(z => z.name.replace('Zone ', 'Z.'));
    this.zoneChart.data.datasets[0].data = this.zoneStats.map(z => z.avgFill);
    this.zoneChart.data.datasets[1].data = this.zoneStats.map(z => z.critical);

    this.zoneChart.update('none');
  }

  getRiskLabel(s: number) {
    return s >= 70 ? 'High' : s >= 45 ? 'Medium' : 'Normal';
  }

  getFillColor(f: number) {
    return f >= 80 ? '#ef4444' : f >= 60 ? '#f97316' : f >= 40 ? '#f59e0b' : '#10b981';
  }

  getGaugeOffset(): number {
    const C = 2 * Math.PI * 46;
    return C * (1 - this.routeEfficiency / 100);
  }
}