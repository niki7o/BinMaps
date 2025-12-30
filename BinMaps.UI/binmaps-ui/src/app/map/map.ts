import { Component, AfterViewInit, ViewEncapsulation } from '@angular/core';
import * as L from 'leaflet';
import 'leaflet.markercluster';

@Component({
  selector: 'app-map',
  standalone: true,
  template: '<div id="map"></div>',
  styleUrls: ['./map.css'],
  encapsulation: ViewEncapsulation.None
})
export class MapComponent implements AfterViewInit {
  private map!: L.Map;
  private cluster = L.markerClusterGroup();
  private allBins: any[] = []; 

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
          <div class="sensor-active-dot" style="position:static; margin-right:10px;"></div> 
          СЪС СЕНЗОР
        </div>
        <hr>
        <div class="legend-row reset-btn" id="f-reset">ПОКАЖИ ВСИЧКИ</div>
      `;

      setTimeout(() => {
        // Филтър по тип
        [0, 1, 2, 3].forEach(t => document.getElementById(`f-type-${t}`)?.addEventListener('click', () => this.filterBy('type', t)));
        // Филтър по запълване
        document.getElementById('f-fill-low')?.addEventListener('click', () => this.filterBy('fill', 'low'));
        document.getElementById('f-fill-med')?.addEventListener('click', () => this.filterBy('fill', 'med'));
        document.getElementById('f-fill-high')?.addEventListener('click', () => this.filterBy('fill', 'high'));
        // Филтър сензор
        document.getElementById('f-sensor')?.addEventListener('click', () => this.filterBy('sensor', true));
        // Ресет
        document.getElementById('f-reset')?.addEventListener('click', () => this.renderBins(this.allBins));
      }, 100);

      return div;
    };
    legend.addTo(this.map);
  }

  loadAreas() {
    fetch('/assets/data/areas.geojson').then(r => r.json()).then(data => {
      L.geoJSON(data, {
        style: (f: any) => ({ color: f.properties.fill, weight: 2, fillOpacity: 0.15, className: 'area-polygon' }),
        onEachFeature: (feature, layer: L.Polygon) => {
          layer.on({
            click: (e) => {
              if (e.originalEvent) (e.originalEvent.target as HTMLElement).blur();
              this.filterBinsByArea(feature.properties.name);
              this.map.fitBounds(e.target.getBounds());
            }
          });
          layer.bindTooltip(feature.properties.name, { sticky: true });
        }
      }).addTo(this.map);
    });
  }

  loadBins() {
    fetch('https://localhost:7277/api/containers').then(r => r.json()).then(bins => {
      this.allBins = bins.map((b: any) => ({
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
      marker.bindPopup(`<b>ID: ${bin.id}</b><br>${bin.address || 'Контейнер'}<br>Запълване: ${bin.fillLevel}%`);
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
    const target = areaName.toLowerCase().trim();
    const filtered = this.allBins.filter(b => (b.areaId || "").toLowerCase().includes(target));
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
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });
  }
}