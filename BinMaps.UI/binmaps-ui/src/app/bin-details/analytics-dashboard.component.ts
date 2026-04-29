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

interface District {
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

interface DashboardStats {
  totalBins: number;
  avgFill: number;
  criticalBins: number;
  heavyBins: number;
  onFireCount: number;
  sensorCoverage: number;
  mostLoadedZone: string;
  clusterCount: number;
  lastUpdated: string;
}

const TRASH_TYPE_LABELS: Record<number, string> = {
  0: 'Смесени',
  1: 'Пластмаса',
  2: 'Хартия',
  3: 'Стъкло'
};

@Component({
  selector: 'app-analytics-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './analytics-dashboard.component.html',
  styleUrls: ['./analytics-dashboard.component.css']
})
export class AnalyticsDashboardComponent implements OnInit, AfterViewInit, OnDestroy {

  private readonly http = inject(HttpClient);

  private hotspotMap!: L.Map;
  private hotspotLayers: L.Layer[] = [];
  private refreshTimer?: ReturnType<typeof setInterval>;
  private initTimer?: ReturnType<typeof setTimeout>;
  private invalidateTimer?: ReturnType<typeof setTimeout>;
  private mapReady = false;
  private chartsReady = false;

  private fillChart?: Chart<'bar'>;
  private typeChart?: Chart<'doughnut'>;
  private zoneChart?: Chart<'bar'>;

  mapLayer: 'all' | 'critical' = 'all';
  dataLoaded = false;

  stats: DashboardStats = {
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
  clusters: District[] = [];
  zoneStats: ZoneStat[] = [];

  get criticalClusters(): District[] {
    return this.clusters.filter(c => c.avgFill >= 60);
  }

  get routeEfficiencyColor(): string {
    if (this.routeEfficiency >= 70) return '#10b981';
    if (this.routeEfficiency >= 45) return '#f59e0b';
    return '#ef4444';
  }

  /** % of bins under 60% fill — i.e. don't need action right now.
   *  This is the inverse of "needs collection" and is the single most
   *  honest indicator of whether the city is on top of its waste. */
  get underControlPct(): number {
    const n = this.stats.totalBins || 0;
    if (!n) return 0;
    const stressed = this.stats.criticalBins + this.stats.heavyBins;
    return Math.max(0, Math.min(100, Math.round(((n - stressed) / n) * 100)));
  }

  /** Active incidents = fires + currently-critical bins. Combined here
   *  because operationally they're treated the same: dispatch immediately. */
  get incidentCount(): number {
    return (this.stats.onFireCount ?? 0);
  }

  ngOnInit(): void {
    this.refreshTimer = setInterval(() => {
      if (this.mapReady && this.chartsReady) this.fetch();
    }, 60_000);
  }

  ngAfterViewInit(): void {
    this.initTimer = setTimeout(() => {
      this.initMap();
      this.initCharts();
      this.chartsReady = true;
      this.fetch();
    }, 150);
  }

  ngOnDestroy(): void {
    clearInterval(this.refreshTimer);
    clearTimeout(this.initTimer);
    clearTimeout(this.invalidateTimer);
    this.hotspotMap?.remove();
    this.fillChart?.destroy();
    this.typeChart?.destroy();
    this.zoneChart?.destroy();
    document.getElementById('an-injected-styles')?.remove();
  }

  private fetch(): void {
    this.http.get<Bin[]>(`${environment.apiUrl}/containers`).subscribe({
      next: bins => this.process(bins),
      error: err => console.error('[Analytics] Грешка при зареждане:', err)
    });
  }

  private process(bins: Bin[]): void {
    if (!bins?.length) return;

    this.computeKPIs(bins);
    this.buildZoneStats(bins);
    this.clusters = this.buildDistricts(bins);
    this.routeEfficiency = this.computeRouteEfficiency(bins);
    this.dataLoaded = true;

    if (this.mapReady) this.redrawHeatmap();
    if (this.chartsReady) {
      this.updateFillChart(bins);
      this.updateTypeChart(bins);
      this.updateZoneChart();
    }
  }

  private computeKPIs(bins: Bin[]): void {
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

  private buildZoneStats(bins: Bin[]): void {
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
        avg * 0.6 + (d.critical / n) * 30 + (d.heavy / n) * 10 + (d.onFire > 0 ? 15 : 0)
      ));
      return { name, avgFill: Math.round(avg), total: n, critical: d.critical, heavy: d.heavy, onFire: d.onFire, loadScore };
    }).sort((a, b) => b.loadScore - a.loadScore);
  }

  private buildDistricts(bins: Bin[], thresholdMeters = 1500): District[] {
    const districts: District[] = [];

    for (const bin of bins) {
      let best: District | null = null;
      let bestDist = Infinity;

      for (const d of districts) {
        const dist = this.haversine(d.centLat, d.centLng, bin.locationY, bin.locationX);
        if (dist < thresholdMeters && dist < bestDist) {
          bestDist = dist;
          best = d;
        }
      }

      if (best) {
        best.bins.push(bin);
        best.centLat = best.bins.reduce((s, b) => s + b.locationY, 0) / best.bins.length;
        best.centLng = best.bins.reduce((s, b) => s + b.locationX, 0) / best.bins.length;
      } else {
        districts.push({
          id: districts.length,
          centLat: bin.locationY,
          centLng: bin.locationX,
          bins: [bin],
          avgFill: 0, maxFill: 0, minFill: 0,
          hasFire: false, riskScore: 0,
          dominantZone: bin.areaId
        });
      }
    }

    this.stats.clusterCount = districts.length;

    districts.forEach(d => {
      const fills = d.bins.map(b => b.fillPercentage);
      d.avgFill = fills.reduce((s, v) => s + v, 0) / fills.length;
      d.maxFill = Math.max(...fills);
      d.minFill = Math.min(...fills);
      d.hasFire = d.bins.some(b => b.status === 'Fire' || (b.temperature != null && b.temperature > 50));

      const n = d.bins.length;
      const critRatio = d.bins.filter(b => b.fillPercentage > 80).length / n;
      const heavyRatio = d.bins.filter(b => b.fillPercentage > 60).length / n;
      d.riskScore = Math.min(100, Math.round(d.avgFill * 0.68 + critRatio * 20 + heavyRatio * 12));

      const zc: Record<string, number> = {};
      d.bins.forEach(b => zc[b.areaId] = (zc[b.areaId] || 0) + 1);
      d.dominantZone = Object.entries(zc).sort((a, b) => b[1] - a[1])[0][0];
    });

    return districts.sort((a, b) => b.riskScore - a.riskScore);
  }

  private computeRouteEfficiency(bins: Bin[]): number {
    const critical = bins.filter(b => b.fillPercentage > 60);
    if (critical.length < 2) return 90;

    const nnDist = this.nearestNeighborDist(critical);
    const lats = critical.map(b => b.locationY);
    const lngs = critical.map(b => b.locationX);
    const diag = this.haversine(Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs));
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
          const d = this.haversine(current.locationY, current.locationX, bins[i].locationY, bins[i].locationX);
          if (d < nd) { nd = d; ni = i; }
        }
      }

      if (ni < 0) break;
      total += nd;
      current = bins[ni];
      visited.add(ni);
    }

    return total;
  }

  private haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6_371_000;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private initMap(): void {
    const el = document.getElementById('hotspot-map');
    if (!el) return;

    this.injectMapStyles();

    this.hotspotMap = L.map('hotspot-map', {
      center: environment.region.center,
      zoom: 12,
      zoomControl: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      dragging: false,
      touchZoom: false,
      keyboard: false,
      attributionControl: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      subdomains: 'abc',
      maxZoom: 19
    }).addTo(this.hotspotMap);

    this.invalidateTimer = setTimeout(() => {
      if (this.hotspotMap && document.getElementById('hotspot-map')) {
        this.hotspotMap.invalidateSize();
      }
      this.mapReady = true;
    }, 200);
  }

  redrawHeatmap(): void {
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
        color, fillColor: color,
        fillOpacity: 0.04 + (c.avgFill / 100) * 0.07,
        weight: 0
      }).addTo(this.hotspotMap);
      this.hotspotLayers.push(outer);

      const midCircle = L.circle([c.centLat, c.centLng], {
        radius: 120 + n * 45 + (c.avgFill / 100) * 260,
        color, fillColor: color,
        fillOpacity: 0.15 + (c.avgFill / 100) * 0.2,
        weight: c.hasFire ? 1.5 : 0.5,
        dashArray: c.hasFire ? '6 4' : undefined
      }).addTo(this.hotspotMap);
      this.hotspotLayers.push(midCircle);

      const above80 = c.bins.filter(b => b.fillPercentage > 80).length;
      const between60and80 = c.bins.filter(b => b.fillPercentage > 60 && b.fillPercentage <= 80).length;
      const fillBarWidth = Math.round(c.avgFill);
      const fillBarColor = c.avgFill >= 80 ? '#ef4444' : c.avgFill >= 60 ? '#f97316' : c.avgFill >= 40 ? '#f59e0b' : '#10b981';
      const riskLabel = c.avgFill >= 80 ? 'Критичен' : c.avgFill >= 60 ? 'Претоварен' : c.avgFill >= 40 ? 'Умерен' : 'Нормален';
      const sensorCount = c.bins.filter(b => b.hasSensor).length;

      const sharedHtml = `
        <div class="bm-tooltip">
          <div class="bm-tt-header">
            <div class="bm-tt-dot" style="background:${color};box-shadow:0 0 8px ${color}88"></div>
            <span class="bm-tt-zone">${c.dominantZone}</span>
            ${c.hasFire ? '<span class="bm-tt-fire">🔥 ПОЖАР</span>' : ''}
          </div>
          <div class="bm-tt-fill-wrap">
            <div class="bm-tt-fill-track">
              <div class="bm-tt-fill-bar" style="width:${fillBarWidth}%;background:${fillBarColor}"></div>
            </div>
            <span class="bm-tt-fill-pct" style="color:${fillBarColor}">${c.avgFill.toFixed(0)}%</span>
          </div>
          <div class="bm-tt-grid">
            <div class="bm-tt-cell">
              <span class="bm-tt-cell-val">${n}</span>
              <span class="bm-tt-cell-lbl">Контейнера</span>
            </div>
            <div class="bm-tt-cell bm-tt-cell--danger">
              <span class="bm-tt-cell-val">${above80}</span>
              <span class="bm-tt-cell-lbl">Критични</span>
            </div>
            <div class="bm-tt-cell bm-tt-cell--warn">
              <span class="bm-tt-cell-val">${between60and80}</span>
              <span class="bm-tt-cell-lbl">Претоварени</span>
            </div>
          </div>
          <div class="bm-tt-footer">
            <span class="bm-tt-badge" style="background:${fillBarColor}22;color:${fillBarColor};border-color:${fillBarColor}44">${riskLabel}</span>
            <span class="bm-tt-sensor">📡 ${sensorCount} сензора</span>
          </div>
        </div>
      `;

      const tooltipOpts = {
        sticky: true,
        className: 'bm-leaflet-tooltip',
        offset: [16, 0] as [number, number]
      };

      const popupOpts = {
        className: 'bm-leaflet-popup',
        maxWidth: 240,
        closeButton: true,
        autoClose: true
      };

      midCircle.bindTooltip(sharedHtml, tooltipOpts);

      const core = L.circle([c.centLat, c.centLng], {
        radius: 30 + n * 10,
        color, fillColor: color,
        fillOpacity: 0.72,
        weight: 0,
        interactive: true
      }).addTo(this.hotspotMap);
      this.hotspotLayers.push(core);

      core.bindTooltip(sharedHtml, tooltipOpts);
      core.bindPopup(sharedHtml, popupOpts);

      core.on('mouseover', () => {
        core.setStyle({ fillOpacity: 0.95, weight: 2 });
        core.openTooltip();
      });
      core.on('mouseout', () => {
        core.setStyle({ fillOpacity: 0.72, weight: 0 });
      });

      if (c.avgFill >= 60 || c.hasFire) {
        const icon = L.divIcon({
          className: '',
          html: `<div class="an-pulse"><div class="an-pulse__ring" style="background:${color}"></div><div class="an-pulse__core" style="background:${color};box-shadow:0 0 10px ${color};cursor:pointer"></div></div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        });
        const pulse = L.marker([c.centLat, c.centLng], { icon, interactive: true }).addTo(this.hotspotMap);
        this.hotspotLayers.push(pulse);
        pulse.on('click',     () => core.openPopup());
        pulse.on('mouseover', () => core.openTooltip());
        pulse.on('mouseout',  () => core.closeTooltip());
      }
    }
  }

  setMapLayer(layer: 'all' | 'critical'): void {
    this.mapLayer = layer;
    if (this.mapReady) this.redrawHeatmap();
  }

  private injectMapStyles(): void {
    const id = 'an-injected-styles';
    if (document.getElementById(id)) return;

    const s = document.createElement('style');
    s.id = id;
    s.textContent = `
      .an-pulse { width:40px;height:40px;display:flex;align-items:center;justify-content:center;position:relative; }
      .an-pulse__ring { position:absolute;width:100%;height:100%;border-radius:50%;opacity:0;animation:an-pulse-anim 2.2s ease-out infinite; }
      .an-pulse__core { width:13px;height:13px;border-radius:50%;z-index:1;position:relative; }
      @keyframes an-pulse-anim { 0%{transform:scale(.35);opacity:.9} 100%{transform:scale(2.4);opacity:0} }

      .bm-leaflet-tooltip { background:transparent!important; border:none!important; box-shadow:none!important; padding:0!important; }
      .bm-leaflet-tooltip::before { display:none!important; }

      .bm-tooltip {
        background: rgba(8,12,24,0.96);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 14px;
        padding: 14px 16px;
        min-width: 200px;
        font-family: 'Inter', system-ui, sans-serif;
        box-shadow: 0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04);
      }
      .bm-tt-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
      }
      .bm-tt-dot {
        width: 10px; height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .bm-tt-zone {
        font-size: 13px;
        font-weight: 700;
        color: #f1f5f9;
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .bm-tt-fire {
        font-size: 10px;
        font-weight: 800;
        color: #ef4444;
        background: rgba(239,68,68,0.15);
        border: 1px solid rgba(239,68,68,0.3);
        border-radius: 6px;
        padding: 2px 7px;
        letter-spacing: .05em;
        animation: an-pulse-anim 1.5s ease-in-out infinite;
      }
      .bm-tt-fill-wrap {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
      }
      .bm-tt-fill-track {
        flex: 1;
        height: 6px;
        border-radius: 3px;
        background: rgba(255,255,255,0.08);
        overflow: hidden;
      }
      .bm-tt-fill-bar {
        height: 100%;
        border-radius: 3px;
      }
      .bm-tt-fill-pct {
        font-size: 14px;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
        min-width: 38px;
        text-align: right;
      }
      .bm-tt-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
      }
      .bm-tt-cell {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 8px;
        padding: 7px 6px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }
      .bm-tt-cell--danger { border-color: rgba(239,68,68,0.2); background: rgba(239,68,68,0.06); }
      .bm-tt-cell--warn   { border-color: rgba(245,158,11,0.2); background: rgba(245,158,11,0.06); }
      .bm-tt-cell-val {
        font-size: 17px;
        font-weight: 800;
        color: #f1f5f9;
        line-height: 1;
      }
      .bm-tt-cell--danger .bm-tt-cell-val { color: #ef4444; }
      .bm-tt-cell--warn   .bm-tt-cell-val { color: #f59e0b; }
      .bm-tt-cell-lbl {
        font-size: 9px;
        font-weight: 600;
        color: rgba(148,163,184,0.8);
        letter-spacing: .06em;
        text-transform: uppercase;
        text-align: center;
      }
      .bm-tt-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid rgba(255,255,255,0.07);
      }
      .bm-tt-badge {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: .07em;
        text-transform: uppercase;
        padding: 3px 10px;
        border-radius: 20px;
        border: 1px solid;
      }
      .bm-tt-sensor {
        font-size: 11px;
        color: rgba(148,163,184,0.7);
        font-weight: 500;
      }
      .bm-leaflet-popup .leaflet-popup-content-wrapper {
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
      }
      .bm-leaflet-popup .leaflet-popup-content {
        margin: 0 !important;
      }
      .bm-leaflet-popup .leaflet-popup-tip-container { display: none !important; }
      .bm-leaflet-popup .leaflet-popup-close-button {
        color: rgba(148,163,184,0.7) !important;
        font-size: 18px !important;
        top: 10px !important;
        right: 10px !important;
        z-index: 10;
      }
    `;
    document.head.appendChild(s);
  }

  private initCharts(): void {
    const fillEl = document.getElementById('fillChart') as HTMLCanvasElement | null;
    const typeEl = document.getElementById('typeChart') as HTMLCanvasElement | null;
    const zoneEl = document.getElementById('zoneChart') as HTMLCanvasElement | null;
    if (!fillEl || !typeEl || !zoneEl) return;

    const tick = { color: 'rgba(226,232,240,.5)', font: { family: "'Inter',sans-serif", size: 11 as const } };
    const grid = { color: 'rgba(255,255,255,.04)' };

    this.fillChart = new Chart(fillEl, {
      type: 'bar',
      data: {
        labels: ['0–20%', '20–40%', '40–60%', '60–80%', '80–100%'],
        datasets: [{
          label: 'Контейнери',
          data: [0, 0, 0, 0, 0],
          backgroundColor: ['#10b981cc', '#34d399cc', '#f59e0bcc', '#f97316cc', '#ef4444cc'],
          borderRadius: 8,
          borderSkipped: false as const
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: tick, grid: grid },
          y: { beginAtZero: true, ticks: tick, grid: grid }
        }
      }
    });

    this.typeChart = new Chart(typeEl, {
      type: 'doughnut',
      data: {
        labels: Object.values(TRASH_TYPE_LABELS),
        datasets: [{
          data: [0, 0, 0, 0],
          backgroundColor: ['#6366f1cc', '#3b82f6cc', '#10b981cc', '#f59e0bcc'],
          hoverOffset: 14,
          borderWidth: 3,
          borderColor: 'rgba(10,15,28,.9)'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        cutout: '68%'
      }
    });

    this.zoneChart = new Chart(zoneEl, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          { label: 'Ср. запълване', data: [], backgroundColor: 'rgba(59,130,246,.75)', borderRadius: 5 },
          { label: 'Критични', data: [], backgroundColor: 'rgba(239,68,68,.75)', borderRadius: 5 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: tick, grid: grid },
          y: { beginAtZero: true, ticks: tick, grid: grid }
        }
      }
    });
  }

  private updateFillChart(bins: Bin[]): void {
    if (!this.fillChart) return;
    const buckets = [0, 0, 0, 0, 0];
    bins.forEach(b => buckets[Math.min(4, Math.floor(b.fillPercentage / 20))]++);
    this.fillChart.data.datasets[0].data = buckets;
    this.fillChart.update('none');
  }

  private updateTypeChart(bins: Bin[]): void {
    if (!this.typeChart) return;
    const sums = [0, 0, 0, 0];
    const counts = [0, 0, 0, 0];
    bins.forEach(b => {
      const t = b.trashType;
      if (t >= 0 && t < 4) { sums[t] += b.fillPercentage; counts[t]++; }
    });
    this.typeChart.data.datasets[0].data = sums.map((s, i) => counts[i] > 0 ? Math.round(s / counts[i]) : 0);
    this.typeChart.update('none');
  }

  private updateZoneChart(): void {
    if (!this.zoneChart) return;
    this.zoneChart.data.labels = this.zoneStats.map(z => z.name.replace('Зона ', 'З.'));
    this.zoneChart.data.datasets[0].data = this.zoneStats.map(z => z.avgFill);
    this.zoneChart.data.datasets[1].data = this.zoneStats.map(z => z.critical);
    this.zoneChart.update('none');
  }

  getRiskLabel(score: number): string {
    if (score >= 70) return 'Претоварено';
    if (score >= 45) return 'Умерено';
    return 'Нормално';
  }

  getFillColor(fill: number): string {
    if (fill >= 80) return '#ef4444';
    if (fill >= 60) return '#f97316';
    if (fill >= 40) return '#f59e0b';
    return '#10b981';
  }

  getGaugeOffset(): number {
    const circumference = 2 * Math.PI * 46;
    return circumference * (1 - this.routeEfficiency / 100);
  }
}