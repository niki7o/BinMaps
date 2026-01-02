import { Component, AfterViewInit, ViewEncapsulation, inject } from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import * as L from 'leaflet';
import 'leaflet.markercluster';
import { RouterUpgradeInitializer } from '@angular/router/upgrade';
import { UrlCodec } from '@angular/common/upgrade';


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
      style: (feature: any) => ({
        color: feature?.properties?.fill || '#3388ff',
        weight: 2,
        fillOpacity: 0.1,
        fillColor: feature?.properties?.fill || '#3388ff',
        className: 'smooth-polygon' 
      }),
      onEachFeature: (feature: any, layer: L.Polygon) => {
        const areaName = feature?.properties?.id;

        layer.on({
          mouseover: (e) => {
            const l = e.target;
            l.setStyle({ fillOpacity: 0.4, weight: 3 }); 
          },
          mouseout: (e) => {
            const l = e.target;
            l.setStyle({ fillOpacity: 0.1, weight: 2 }); 
          },
          click: (e) => {
            L.DomEvent.stopPropagation(e);
           
            this.map.getContainer().focus(); 
            
            if (areaName) {
              this.filterBinsByArea(areaName);
              this.getAndDrawRoute(areaName);
              this.map.fitBounds(layer.getBounds(), { animate: true, duration: 1.0 });
            }
          }
        });

        if (areaName) {
          layer.bindTooltip(areaName, { 
            sticky: true, 
            className: 'custom-tooltip' 
          });
        }
      }
    }).addTo(this.map);
  });
}

  loadBins() {
    this.http.get<any[]>('https://localhost:7277/api/containers').subscribe(bins => {
      this.allBins = bins.map(b => ({
        ...b, latitude: b.locationY, longitude: b.locationX, fillLevel: b.fillPercentage
      }));
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
    if (criteria === 'sensor') filtered = this.allBins.filter(b => b.hasSensor === true);
    if (criteria === 'fill') {
      if (value === 'low') filtered = this.allBins.filter(b => b.fillLevel <= 40);
      if (value === 'med') filtered = this.allBins.filter(b => b.fillLevel > 40 && b.fillLevel <= 70);
      if (value === 'high') filtered = this.allBins.filter(b => b.fillLevel > 70);
    }
    this.renderBins(filtered);
  }

filterBinsByArea(areaName: string) {
  if (!areaName) return;
  const target = areaName.toLowerCase().trim();
  const filtered = this.allBins.filter(bin => {
  const binAreaValue = (bin.areaId || bin.area || bin.AreaId || "").toString().toLowerCase().trim();
    return binAreaValue.includes(target) || target.includes(binAreaValue);
  });

  console.log(`Кликнато върху: ${areaName} | Намерени кофи: ${filtered.length}`);
  this.renderBins(filtered);
}

  getAndDrawRoute(areaName: string) {
  const binsInArea = this.allBins.filter(
    b => b.areaId?.toLowerCase() === areaName.toLowerCase()
  );

  if (!binsInArea.length) return;

  // взимаме типа с най-много сензори
  const typeCount: any = {};
  binsInArea
    .filter(b => b.hasSensor)
    .forEach(b => typeCount[b.trashType] = (typeCount[b.trashType] || 0) + 1);

  const trashType = Number(
    Object.keys(typeCount).sort((a, b) => typeCount[b] - typeCount[a])[0]
  );

  this.http
    .get<any[]>(`https://localhost:7277/api/Trucks/route-by-area/${areaName}/${trashType}`)
    .subscribe(points => this.drawRoute(points));
  }
drawRoute(points: any[]) {
  if (this.routeLine) this.map.removeLayer(this.routeLine);
  if (this.truckMarker) this.map.removeLayer(this.truckMarker);

  if (!points?.length) return;

  const latLngs: L.LatLngTuple[]=  points.map(p => [p.locationY, p.locationX]);

  this.routeLine = L.polyline(latLngs, {
    color: '#ffcc00',
    weight: 4,
    opacity: 0.9
  }).addTo(this.map);

  this.truckMarker = L.marker(latLngs[0], {
    icon: L.icon({
      iconUrl: 'assets/icons/truck.svg',
      iconSize: [32, 32]
    })
  }).addTo(this.map);
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
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });
  }
}