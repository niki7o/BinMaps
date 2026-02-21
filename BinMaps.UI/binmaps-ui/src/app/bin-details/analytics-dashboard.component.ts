import {
  Component, OnInit, OnDestroy, AfterViewInit, inject
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ChartData } from 'chart.js';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import * as L from 'leaflet';


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

interface ZoneStat {
  name: string;
  avgFill: number;
  total: number;
  critical: number;      
  onFire: number;          
  loadScore: number;       
}

type TLabel = string | string[];


@Component({
  selector: 'app-analytics-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective],
  templateUrl: './analytics-dashboard.component.html',
  styleUrls: ['./analytics-dashboard.component.css']
})
export class AnalyticsDashboardComponent implements OnInit, AfterViewInit, OnDestroy {

  private http = inject(HttpClient);
  private hotspotMap!: L.Map;
  private hotspotLayers: L.Layer[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private mapReady = false;

  selectedZoneFilter = '';

  
  stats = {
    totalBins: 0,
    avgFill: 0,
    criticalBins: 0,       
    onFireCount: 0,        
    sensorCoverage: 0,     
    mostLoadedZone: '—',
    estimatedRoutes: 0,    
    lastUpdated: '—'
  };

  
  fillDistData:  ChartData<'bar',      number[], TLabel> = { labels: [], datasets: [] };
  zoneData:      ChartData<'bar',      number[], TLabel> = { labels: [], datasets: [] };
  typeData:      ChartData<'doughnut', number[], TLabel> = { labels: [], datasets: [] };
  top5Data:      ChartData<'bar',      number[], TLabel> = { labels: [], datasets: [] };

  zoneStats: ZoneStat[] = [];

 
  readonly barOpts = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, grid: { color: '#f3f4f6' } } }
  };
  readonly zoneOpts = {
    responsive: true,
    scales: { y: { beginAtZero: true, grid: { color: '#f3f4f6' } } }
  };
  readonly doughnutOpts = {
    responsive: true,
    plugins: { legend: { position: 'bottom' as const } },
    cutout: '65%'
  };
  readonly top5Opts = {
    responsive: true,
    indexAxis: 'y' as const,
    plugins: { legend: { display: false } },
    scales: { x: { min: 0, max: 100, grid: { color: '#f3f4f6' } } }
  };

  

  ngOnInit() {
    this.fetch();
    this.timer = setInterval(() => this.fetch(), 60_000);
  }

  ngAfterViewInit() {
    this.initMap();
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.hotspotMap) this.hotspotMap.remove();
  }

 

  private fetch() {
    this.http.get<Bin[]>('https://localhost:7277/api/containers').subscribe({
      next: bins => this.process(bins),
      error: err => console.error('Analytics fetch error', err)
    });
  }

  private process(bins: Bin[]) {
    this.stats.lastUpdated = new Date().toLocaleTimeString('bg-BG');
    this.computeKPIs(bins);
    this.buildZoneStats(bins);
    this.buildFillDist(bins);
    this.buildZoneChart();
    this.buildTypeChart(bins);
    this.buildTop5(bins);
    if (this.mapReady) this.redrawHotspots(bins);
  }


  private computeKPIs(bins: Bin[]) {
    const n = bins.length;
    if (!n) return;

    const avgFill  = bins.reduce((s, b) => s + b.fillPercentage, 0) / n;
    const critical = bins.filter(b => b.fillPercentage > 80).length;
    const onFire   = bins.filter(b =>
      b.status === 'Fire' || (b.temperature != null && b.temperature > 50)
    ).length;
    const withSensor = bins.filter(b => b.hasSensor).length;

    
    const zoneAvg: Record<string, number[]> = {};
    bins.forEach(b => {
      (zoneAvg[b.areaId] ??= []).push(b.fillPercentage);
    });
    const sorted = Object.entries(zoneAvg)
      .map(([z, arr]) => ({ z, avg: arr.reduce((a, v) => a + v, 0) / arr.length }))
      .sort((a, b) => b.avg - a.avg);

   
    this.stats = {
      totalBins:        n,
      avgFill:          Math.round(avgFill),
      criticalBins:     critical,
      onFireCount:      onFire,
      sensorCoverage:   Math.round((withSensor / n) * 100),
      mostLoadedZone:   sorted[0]?.z ?? '—',
      estimatedRoutes:  Math.max(1, Math.ceil(critical / 8)),
      lastUpdated:      new Date().toLocaleTimeString('bg-BG')
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
        const avg = d.fills.reduce((s, v) => s + v, 0) / d.fills.length;
       
        const loadScore = Math.min(100, Math.round(avg + (d.critical / d.fills.length) * 20));
        return {
          name,
          avgFill:   Math.round(avg),
          total:     d.fills.length,
          critical:  d.critical,
          onFire:    d.onFire,
          loadScore
        };
      })
      .sort((a, b) => b.loadScore - a.loadScore);
  }

 

  private buildFillDist(bins: Bin[]) {
    const buckets = [0, 0, 0, 0, 0]; 
    bins.forEach(b => {
      buckets[Math.min(4, Math.floor(b.fillPercentage / 20))]++;
    });
    this.fillDistData = {
      labels: ['0–20%', '20–40%', '40–60%', '60–80%', '80–100%'],
      datasets: [{
        label: 'Контейнери',
        data: buckets,
        backgroundColor: ['#10b981', '#34d399', '#f59e0b', '#f97316', '#ef4444'],
        borderRadius: 6,
        borderSkipped: false as const
      }]
    };
  }

  private buildZoneChart() {
    const zones = this.zoneStats;
    this.zoneData = {
      labels: zones.map(z => z.name.replace('Зона ', 'З.')),
      datasets: [
        {
          label: 'Средно запълване (%)',
          data: zones.map(z => z.avgFill),
          backgroundColor: '#3b82f6',
          borderRadius: 4
        },
        {
          label: 'Критични (>80%)',
          data: zones.map(z => z.critical),
          backgroundColor: '#ef4444',
          borderRadius: 4
        }
      ]
    };
  }

  private buildTypeChart(bins: Bin[]) {
    const names  = ['Смесен', 'Пластмаса', 'Хартия', 'Стъкло'];
    const colors = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b'];
    const sums   = [0, 0, 0, 0];
    const counts = [0, 0, 0, 0];

    bins.forEach(b => {
      const t = b.trashType;
      if (t >= 0 && t < 4) { sums[t] += b.fillPercentage; counts[t]++; }
    });

    this.typeData = {
      labels: names,
      datasets: [{
        data: sums.map((s, i) => counts[i] ? Math.round(s / counts[i]) : 0),
        backgroundColor: colors,
        hoverOffset: 10
      }]
    };
  }

  private buildTop5(bins: Bin[]) {
    const top5 = [...bins]
      .sort((a, b) => b.fillPercentage - a.fillPercentage)
      .slice(0, 5);

    this.top5Data = {
      labels: top5.map(b => `#${b.id} · ${b.areaId.replace('Зона ', 'З.')}`),
      datasets: [{
        label: 'Запълване %',
        data: top5.map(b => Math.round(b.fillPercentage)),
        backgroundColor: top5.map(b =>
          b.fillPercentage >= 90 ? '#dc2626' :
          b.fillPercentage >= 80 ? '#ef4444' : '#f97316'
        ),
        borderRadius: 4
      }]
    };
  }

 

  private initMap() {
    const el = document.getElementById('hotspot-map');
    if (!el) return;

    this.hotspotMap = L.map('hotspot-map', {
      center:            [42.6977, 23.3219],
      zoom:              12,
      zoomControl:       true,
      scrollWheelZoom:   false,
      attributionControl: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      opacity: 0.85
    }).addTo(this.hotspotMap);

    this.mapReady = true;

    
    this.http.get<Bin[]>('https://localhost:7277/api/containers').subscribe(bins => {
      this.redrawHotspots(bins);
    });
  }

  private redrawHotspots(bins: Bin[]) {
   
    this.hotspotLayers.forEach(l => this.hotspotMap.removeLayer(l));
    this.hotspotLayers = [];

    bins
      .filter(b => b.fillPercentage > 40)  
      .forEach(bin => {
      
        const isFire = bin.status === 'Fire' ||
                       (bin.temperature != null && bin.temperature > 50);

        const color = isFire                      ? '#dc2626' :
                      bin.fillPercentage >= 80    ? '#ef4444' :
                      bin.fillPercentage >= 60    ? '#f97316' : '#f59e0b';

        const radiusM  = 120 + (bin.fillPercentage / 100) * 380;
        const opacity  = 0.12 + (bin.fillPercentage / 100) * 0.40;

        const circle = L.circle([bin.locationY, bin.locationX], {
          radius:      radiusM,
          color:       color,
          fillColor:   color,
          fillOpacity: opacity,
          weight:      isFire ? 2 : 1,
          dashArray:   isFire ? '4 4' : undefined
        });

        circle.bindTooltip(`
          <div style="min-width:160px;font-size:13px">
            <strong>Контейнер #${bin.id}</strong><br>
            Запълване: <b style="color:${color}">${bin.fillPercentage.toFixed(0)}%</b><br>
            Зона: ${bin.areaId}<br>
            ${bin.temperature != null ? `🌡 ${bin.temperature}°C` : ''}
            ${isFire ? '<br>🔥 <b>Риск от пожар!</b>' : ''}
          </div>
        `, { sticky: true, opacity: 0.97 });

        circle.addTo(this.hotspotMap);
        this.hotspotLayers.push(circle);
      });
  }

 

  getRiskClass(loadScore: number): string {
    if (loadScore >= 70) return 'risk-high';
    if (loadScore >= 45) return 'risk-medium';
    return 'risk-low';
  }

  getRiskLabel(loadScore: number): string {
    if (loadScore >= 70) return 'Критична';
    if (loadScore >= 45) return 'Умерена';
    return 'Нормална';
  }

  getFillColor(fill: number): string {
    if (fill >= 80) return '#ef4444';
    if (fill >= 60) return '#f97316';
    if (fill >= 40) return '#f59e0b';
    return '#10b981';
  }

  getCardClass(fill: number): string {
    if (fill >= 80) return 'danger';
    if (fill >= 60) return 'warning';
    return 'success';
  }
  getTop5Width(index: number): string {
  const val = this.top5Data.datasets[0]?.data[index];
  return val !== undefined ? val + '%' : '0%';
}

getTop5Color(index: number): string {
  const val = this.top5Data.datasets[0]?.data[index];
  if (val === undefined) return 'var(--status-warn)';
  return val > 80 ? 'var(--status-critical)' : 'var(--status-warn)';
}

getTop5Value(index: number): number {
  const val = this.top5Data.datasets[0]?.data[index];
  return val !== undefined ? Math.round(val) : 0;
}
}