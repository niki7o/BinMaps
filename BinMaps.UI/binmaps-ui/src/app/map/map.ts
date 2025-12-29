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

  ngAfterViewInit(): void {
    const map = L.map('map').setView([42.6977, 23.3219], 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: 'BinMaps'
    }).addTo(map);

    const legend = (L as any).control({ position: 'bottomleft' });

    legend.onAdd = () => {
      const div = L.DomUtil.create('div', 'map-legend');
      div.innerHTML = `
        <div class="legend-header">BIN MONITOR</div>
        
        <div class="legend-section">
          <div class="row"><img src="assets/icons/bin-plastic.svg"> Пластмаса</div>
          <div class="row"><img src="assets/icons/bin-paper.svg"> Хартия</div>
          <div class="row"><img src="assets/icons/bin-glass.svg"> Стъкло</div>
          <div class="row"><img src="assets/icons/bin-mixed.svg"> Смесен</div>
        </div>

        <hr>

        <div class="legend-section">
          <div class="row"><span class="fill low"></span> < 40% (Оптимално)</div>
          <div class="row"><span class="fill medium"></span> 40-70% (Внимание)</div>
          <div class="row"><span class="fill high"></span> > 70% (Критично)</div>
        </div>

        <hr>

        <div class="row">
          <div class="sensor-legend-wrapper">
            <div class="sensor-active"></div>
          </div>
          <b style="color: #00f2ff; margin-left: 10px; font-size: 11px;">АКТИВЕН СЕНЗОР</b>
        </div>

        <div class="row" style="margin-top: 10px;">
          <div class="fire-legend-wrapper">
             <div class="fire" style="transform: scale(0.4) translate(-50%, -50%); top: 0;">
                <div class="fire-flame"></div><div class="fire-flame"></div><div class="fire-flame"></div>
             </div>
          </div>
          <b style="color: #ff3300; margin-left: 10px; font-size: 11px;">КРИТИЧНО (ГОРЯЩА)</b>
        </div>
      `;
      return div;
    };

    legend.addTo(map);
    this.loadAreas(map);
    this.loadBins(map);
  }

  loadAreas(map: L.Map) {
    fetch('/assets/data/areas.geojson')
      .then(r => r.json())
      .then(data => {
        L.geoJSON(data, {
          style: { color: '#000', weight: 4, fillOpacity: 0 },
          onEachFeature: (feature, layer: any) => {
            layer.on({
              mouseover: (e: any) => e.target.setStyle({ weight: 4 }),
              mouseout: (e: any) => e.target.setStyle({ weight: 2 }),
              click: (e: any) => map.fitBounds(e.target.getBounds(), { padding: [40, 40] })
            });
            layer.bindPopup(`<b>${feature.properties.name}</b>`);
          }
        }).addTo(map);
      });
  }

  loadBins(map: L.Map) {
    fetch('/assets/data/trash-containers.json')
      .then(r => r.json())
      .then(bins => this.renderBins(map, bins));
  }

  renderBins(map: L.Map, bins: any[]) {
    const cluster = L.markerClusterGroup();
    bins.forEach(bin => {
      const marker = L.marker([bin.latitude, bin.longitude], { icon: this.getBinIcon(bin) });
     marker.bindPopup(`
  <div style="text-align: center">
    <b style="font-size: 14px;">${bin.address}</b><br/>
    <hr>
    Запълване: <b>${bin.fillLevel}%</b><br/>
    Температура: <b style="color: ${bin.hasSensor && bin.temperature > 55 ? '#ff3300' : '#28a745'}">${bin.temperature}°C</b><br/>
    Тип: ${bin.trashType}
  </div>
`);
      cluster.addLayer(marker);
    });
    map.addLayer(cluster);
  }

  getBinIcon(bin: any): L.DivIcon {
  const iconMap: { [key: string]: string } = {
    'пластмаса': 'plastic', 'хартия': 'paper', 'стъкло': 'glass', 'смесен': 'mixed'
  };

  const iconName = iconMap[bin.trashType.toLowerCase()] || 'mixed';
  const fillClass = bin.fillLevel > 70 ? 'high' : bin.fillLevel > 40 ? 'medium' : 'low';
  
  // ВАЖНО: Гори само ако ИМА сензор И температурата е висока
  const isBurning = bin.hasSensor && bin.temperature > 55; 

  return L.divIcon({
    className: 'bin-wrapper',
    html: `
      <div class="bin-container ${isBurning ? 'burning-square' : ''}">
        <div class="bin ${fillClass}">
          <img src="assets/icons/bin-${iconName}.svg" class="bin-icon" />
          ${bin.hasSensor ? '<div class="sensor-active"></div>' : ''}
        </div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 44]
  });
}
}