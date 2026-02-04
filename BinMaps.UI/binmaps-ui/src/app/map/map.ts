import { Component, AfterViewInit, ViewEncapsulation, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import * as L from 'leaflet';
import 'leaflet.markercluster';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables);

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  templateUrl: './map.html',
  styleUrls: ['./map.css'],
  encapsulation: ViewEncapsulation.None
})
export class MapComponent implements AfterViewInit, OnInit {
  private map!: L.Map;
  private cluster = L.markerClusterGroup();
  private allBins: any[] = [];
  private routeLine?: L.Polyline;
  private truckMarker?: L.Marker;
  private selectedBinForReport: any = null;

  private http = inject(HttpClient);
  private router = inject(Router);

  currentUser: any = null;

  stats = {
    totalBins: 142,
    averageFill: 47,
    averageTemp: 25,
    dailyReports: 100,
    efficiency: 92
  };

  public pieChartData: ChartData<'pie', number[], string | string[]> = {
    labels: ['Ниско (<40%)', 'Средно (40–70%)', 'Високо (>70%)'],
    datasets: [{
      data: [0, 0, 0],
      backgroundColor: ['#00ff88', '#ffcc00', '#ff3300'],
      hoverOffset: 4
    }]
  };

  public pieChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: 'Разпределение на запълване' }
    }
  };

  public barChartData: ChartData<'bar', number[], string | string[]> = {
    labels: [],
    datasets: [{
      data: [],
      backgroundColor: '#ff3300',
      label: 'Запълване %'
    }]
  };

  public barChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: true, text: 'Топ 5 най-запълнени кофи' }
    },
    scales: {
      y: { beginAtZero: true, max: 100 }
    }
  };

  ngOnInit() {
    this.checkUser();
  }

  private checkUser() {
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        this.currentUser = JSON.parse(userData);
      } catch {
        this.currentUser = null;
      }
    }
  }

  logout() {
    localStorage.removeItem('user');
    this.currentUser = null;
    this.router.navigate(['/']).then(() => {
      window.location.reload();
    });
  }

  ngAfterViewInit(): void {
    this.map = L.map('map').setView([42.6977, 23.3219], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);

    this.map.addLayer(this.cluster);

    this.loadAreas();
    this.loadBins();
    this.initLegend();
    this.initSimulationMenu();
    this.setupReportButton();
  }

  private setupReportButton() {
    setTimeout(() => {
      const reportBtn = document.querySelector('.btn-submit-report');
      if (reportBtn) {
        reportBtn.addEventListener('click', () => this.submitReport());
      }
    }, 500);
  }

  private async submitReport() {
    if (!this.currentUser) {
      alert('Трябва да сте влезли в системата за да изпратите репорт!');
      return;
    }

    const binIdInput = document.getElementById('selected-bin-id') as HTMLInputElement;
    const reportTypeSelect = document.getElementById('report-type') as HTMLSelectElement;
    const imageInput = document.getElementById('report-image') as HTMLInputElement;
    
    if (!this.selectedBinForReport) {
      alert('Моля изберете кофа от картата като кликнете върху нея!');
      return;
    }

    const formData = new FormData();
    formData.append('TrashContainerId', this.selectedBinForReport.id.toString());
    formData.append('ReportType', reportTypeSelect.value);
    
    if (imageInput.files && imageInput.files[0]) {
      formData.append('Photo', imageInput.files[0]);
    }

    try {
      const response = await fetch('https://localhost:7277/api/reports', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Репортът е изпратен успешно! ${result.message}`);
        
        this.selectedBinForReport = null;
        binIdInput.value = '';
        reportTypeSelect.value = 'Full';
        imageInput.value = '';
      } else {
        alert('Грешка при изпращане на репорт!');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Възникна грешка!');
    }
  }

  private initLegend() {
    const legend = (L as any).control({ position: 'bottomleft' });
    legend.onAdd = () => {
      const div = L.DomUtil.create('div', 'map-legend');
      div.innerHTML = `
        <div class="legend-header">ФИЛТРИРАНЕ</div>
        <div class="legend-section">
          <div class="legend-row" id="f-type-1"><img src="assets/icons/bin-plastic.svg"> Пластмаса</div>
          <div class="legend-row" id="f-type-2"><img src="assets/icons/bin-paper.svg"> Хартия</div>
          <div class="legend-row" id="f-type-3"><img src="assets/icons/bin-glass.svg"> Стъкло</div>
          <div class="legend-row" id="f-type-0"><img src="assets/icons/bin-mixed.svg"> Смесен</div>
        </div>
        <hr>
        <div class="legend-section">
          <div class="legend-row" id="f-fill-low"><span class="fill low"></span> < 40%</div>
          <div class="legend-row" id="f-fill-med"><span class="fill medium"></span> 40-70%</div>
          <div class="legend-row" id="f-fill-high"><span class="fill high"></span> > 70%</div>
        </div>
        <hr>
        <div class="legend-row" id="f-sensor">
          <div class="sensor-active-dot" style="position:static; margin-right:10px;"></div> СЪС СЕНЗОР
        </div>
        <hr>
        <div class="legend-row reset-btn" id="f-reset">ПОКАЖИ ВСИЧКИ</div>
      `;

      setTimeout(() => {
        [0, 1, 2, 3].forEach(t => document.getElementById(`f-type-${t}`)?.addEventListener('click', () => this.filterBy('type', t)));

        document.getElementById('f-fill-low')?.addEventListener('click', () => this.filterBy('fill', 'low'));
        document.getElementById('f-fill-med')?.addEventListener('click', () => this.filterBy('fill', 'med'));
        document.getElementById('f-fill-high')?.addEventListener('click', () => this.filterBy('fill', 'high'));
        document.getElementById('f-sensor')?.addEventListener('click', () => this.filterBy('sensor', true));
        document.getElementById('f-reset')?.addEventListener('click', () => {
          this.renderBins(this.allBins);
          if (this.routeLine) this.map.removeLayer(this.routeLine);
          if (this.truckMarker) this.map.removeLayer(this.truckMarker);
        });
      }, 100);

      return div;
    };
    legend.addTo(this.map);
  }

  private initSimulationMenu() {
    const simControl = (L as any).control({ position: 'topright' });
    simControl.onAdd = () => {
      const div = L.DomUtil.create('div', 'sim-container');
      div.innerHTML = `
        <button id="sim-toggle-btn" class="sim-main-btn">🚛 СИМУЛАЦИЯ</button>
        <div id="sim-menu" class="sim-menu-panel hidden">
          <label>Зона:</label>
          <select id="sim-area-select"><option value="">-- Избери --</option></select>
          <label>Тип боклук:</label>
          <select id="sim-type-select">
            <option value="0">Смесен</option>
            <option value="1">Пластмаса</option>
            <option value="2">Хартия</option>
            <option value="3">Стъкло</option>
          </select>
          <button id="sim-start-btn" class="sim-start-btn">СТАРТ</button>
        </div>
      `;

      setTimeout(() => {
        const areaSelect = document.getElementById('sim-area-select') as HTMLSelectElement;
        this.http.get('/assets/data/areas.geojson').subscribe((data: any) => {
          data.features.forEach((f: any) => {
            const opt = document.createElement('option');
            opt.value = f.properties.id;
            opt.innerText = f.properties.id;
            areaSelect.appendChild(opt);
          });
        });

        document.getElementById('sim-toggle-btn')?.addEventListener('click', () => 
          document.getElementById('sim-menu')?.classList.toggle('hidden'));

        document.getElementById('sim-start-btn')?.addEventListener('click', () => {
          const area = areaSelect.value;
          const type = (document.getElementById('sim-type-select') as HTMLSelectElement).value;
          if (area) this.startTruckSimulation(area, Number(type));
        });
      }, 100);
      return div;
    };
    simControl.addTo(this.map);
  }

  private startTruckSimulation(areaId: string, type: number) {
    const encodedArea = encodeURIComponent(areaId);
    this.http.get<any[]>(`https://localhost:7277/api/Trucks/route-by-area/${encodedArea}/${type}`)
      .subscribe(points => {
        if (!points?.length) return;

        const coords = points.map(p => `${p.locationX},${p.locationY}`).join(';');
        const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;

        this.http.get<any>(url).subscribe(res => {
          if (res.code === 'Ok') {
            const road = res.routes[0].geometry.coordinates.map((c: any) => [c[1], c[0]]);
            this.animateRoute(road);
          }
        });
      });
  }

  private animateRoute(path: L.LatLngTuple[]) {
    if (this.routeLine) this.map.removeLayer(this.routeLine);
    if (this.truckMarker) this.map.removeLayer(this.truckMarker);

    this.routeLine = L.polyline(path, { color: '#00f2ff', weight: 5, opacity: 0.8 }).addTo(this.map);
    this.truckMarker = L.marker(path[0], {
      icon: L.icon({ iconUrl: 'assets/icons/truck.svg', iconSize: [40, 40] })
    }).addTo(this.map);

    let i = 0;
    const interval = setInterval(() => {
      if (i >= path.length) { clearInterval(interval); return; }
      this.truckMarker?.setLatLng(path[i]);
      i++;
    }, 40);
  }

  loadAreas() {
    this.http.get('/assets/data/areas.geojson').subscribe((data: any) => {
      L.geoJSON(data, {
        style: (f: any) => ({ color: f?.properties?.fill || '#3388ff', weight: 2, fillOpacity: 0.1, className: 'smooth-polygon' }),
        onEachFeature: (f: any, layer: any) => {
          layer.on('click', (e: any) => {
            L.DomEvent.stopPropagation(e);
            this.filterBinsByArea(f.properties.id);
            this.map.fitBounds(layer.getBounds());
          });
        }
      }).addTo(this.map);
    });
  }

  loadBins() {
    this.http.get<any[]>('https://localhost:7277/api/containers').subscribe(bins => {
      this.allBins = bins.map(b => ({ ...b, latitude: b.locationY, longitude: b.locationX, fillLevel: b.fillPercentage }));
      this.renderBins(this.allBins);

      const total = this.allBins.length;
      const sumFill = this.allBins.reduce((acc, curr) => acc + curr.fillLevel, 0);
      const sumTemp = this.allBins.reduce((acc, curr) => acc + (curr.temperature || 0), 0);

      this.stats = {
        totalBins: total,
        averageFill: total > 0 ? Math.round(sumFill / total) : 0,
        averageTemp: total > 0 ? Math.round(sumTemp / total) : 0,
        dailyReports: 12,
        efficiency: 95
      };

      const low = this.allBins.filter(b => b.fillLevel < 40).length;
      const med = this.allBins.filter(b => b.fillLevel >= 40 && b.fillLevel <= 70).length;
      const high = this.allBins.filter(b => b.fillLevel > 70).length;

      this.pieChartData = {
        labels: ['Ниско (<40%)', 'Средно (40–70%)', 'Високо (>70%)'],
        datasets: [{
          data: [low, med, high],
          backgroundColor: ['#00ff88', '#ffcc00', '#ff3300']
        }]
      };

      const top5 = [...this.allBins]
        .sort((a, b) => b.fillLevel - a.fillLevel)
        .slice(0, 5);

      this.barChartData = {
        labels: top5.map(b => `BIN-${b.id}`),
        datasets: [{
          data: top5.map(b => b.fillLevel),
          backgroundColor: '#ff3300',
          label: 'Запълване %'
        }]
      };
    });
  }

  renderBins(bins: any[]) {
    this.cluster.clearLayers();
    bins.forEach(bin => {
      const marker = L.marker([bin.latitude, bin.longitude], { icon: this.getBinIcon(bin) });
      
      marker.on('click', () => {
        this.selectedBinForReport = bin;
        const binIdInput = document.getElementById('selected-bin-id') as HTMLInputElement;
        if (binIdInput) {
          binIdInput.value = `Кофа #${bin.id}`;
        }
        
        marker.bindPopup(`<b>ID: ${bin.id}</b><br>Запълване: ${bin.fillLevel}%<br><small>Избрана за репорт</small>`).openPopup();
      });
      
      this.cluster.addLayer(marker);
    });
  }

  filterBy(criteria: string, value: any) {
    let filtered = this.allBins;
    if (criteria === 'type') filtered = this.allBins.filter(b => b.trashType === value);
    if (criteria === 'sensor') filtered = this.allBins.filter(b => b.hasSensor);
    this.renderBins(filtered);
  }

  filterBinsByArea(areaName: string) {
    const filtered = this.allBins.filter(b => (b.areaId || "").toLowerCase().includes(areaName.toLowerCase()));
    this.renderBins(filtered);
  }

  getBinIcon(bin: any): L.DivIcon {
    const iconMap: any = { 0: 'mixed', 1: 'plastic', 2: 'paper', 3: 'glass' };
    const statusColor = bin.fillLevel > 70 ? '#ff3300' : bin.fillLevel > 40 ? '#ffcc00' : '#00ff88';
    const isBurning = bin.temperature > 55;
    return L.divIcon({
      className: 'bin-marker-container',
      html: `
        <div class="bin-wrapper ${isBurning ? 'is-burning' : ''}">
          <div class="bin-id-badge">${bin.id}</div>
          <div class="bin-circle" style="border: 2px solid ${statusColor}; box-shadow: 0 0 10px ${statusColor}55;">
            <img src="assets/icons/bin-${iconMap[bin.trashType] || 'mixed'}.svg" class="bin-img" />
            ${bin.hasSensor ? '<div class="sensor-dot-active"></div>' : ''}
          </div>
          ${isBurning ? '<div class="fire-emoji">🔥</div>' : ''}
        </div>`,
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });
  }
}