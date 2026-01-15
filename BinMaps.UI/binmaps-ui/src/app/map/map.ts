import { Component, AfterViewInit, ViewEncapsulation, inject } from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import * as L from 'leaflet';
import 'leaflet.markercluster';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [HttpClientModule],
  template: '<div id="map"></div>',
  styleUrls: ['./map.css'],
  encapsulation: ViewEncapsulation.None
})
export class MapComponent implements AfterViewInit {
  private map!: L.Map;
  private cluster = L.markerClusterGroup();
  private allBins: any[] = [];
  private routeLine?: L.Polyline;
  private truckMarker?: L.Marker;
  
  private http = inject(HttpClient);

  ngAfterViewInit(): void {
    this.map = L.map('map').setView([42.6977, 23.3219], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
    this.map.addLayer(this.cluster);

    this.loadAreas();
    this.loadBins();
    this.initSimulationMenu();
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
    this.http.get<any[]>(`https://localhost:7277/api/Trucks/route-by-area/${areaId}/${type}`)
      .subscribe(points => {
        if (!points?.length) return;
        
        const coords = points.map(p => `${p.locationX},${p.locationY}`).join(';');
        const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;

        this.http.get(url).subscribe((res: any) => {
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

          if (this.routeLine)

             this.map.removeLayer(this.routeLine);

          if (this.truckMarker)

             this.map.removeLayer(this.truckMarker);

        });

      }, 100);
      return div;
    };
    legend.addTo(this.map);
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
      this.initLegend();
    });
  }

  renderBins(bins: any[]) {
    this.cluster.clearLayers();
    bins.forEach(bin => {
      const marker = L.marker([bin.latitude, bin.longitude], { icon: this.getBinIcon(bin) });
      marker.bindPopup(`<b>ID: ${bin.id}</b><br>Запълване: ${bin.fillLevel}%`);
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