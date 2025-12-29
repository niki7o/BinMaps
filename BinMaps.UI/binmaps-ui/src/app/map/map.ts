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
    <b>Legend</b>

    <div class="row">
      <img src="assets/icons/bin-plastic.svg"> Plastic
    </div>
    <div class="row">
      <img src="assets/icons/bin-paper.svg"> Paper
    </div>
    <div class="row">
      <img src="assets/icons/bin-glass.svg"> Glass
    </div>
    <div class="row">
      <img src="assets/icons/bin-mixed.svg"> Mixed
    </div>

    <hr>

    <div class="row">
      <span class="fill low"></span> Low fill
    </div>
    <div class="row">
      <span class="fill medium"></span> Medium fill
    </div>
    <div class="row">
      <span class="fill high"></span> High fill
    </div>

    <hr>

    <div class="row">
      <span class="sensor-dot"></span> Sensor active
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
  style: {
    color: '#000',
    weight: 4,
    fillOpacity: 0
  },
  onEachFeature: (feature, layer: any) => {
  layer.on({
    mouseover: (e: any) => {
      e.target.setStyle({ weight: 4 });
    },
    mouseout: (e: any) => {
      e.target.setStyle({ weight: 2 });
    },
    click: (e: any) => {
      map.fitBounds(e.target.getBounds(), { padding: [40, 40] });
    }
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
      const marker = L.marker(
        [bin.latitude, bin.longitude],
        { icon: this.getBinIcon(bin) }
      );

      marker.bindPopup(`
        <b>${bin.address}</b><br/>
        Area: ${bin.area}<br/>
        Type: ${bin.trashType}<br/>
        Fill: ${bin.fillLevel}%<br/>
        Sensor: ${bin.hasSensor ? 'Има' : 'Няма'}
      `);

      cluster.addLayer(marker);
    });

    map.addLayer(cluster);
  }

  getBinIcon(bin: any): L.DivIcon {
  const fill =
    bin.fillLevel > 70 ? 'high' :
    bin.fillLevel > 40 ? 'medium' : 'low';

  return L.divIcon({
    className: 'bin-wrapper',
    html: `
      <div class="bin ${fill}">
        <img src="assets/icons/bin-${bin.trashType}.svg" />
        ${bin.hasSensor ? '<span class="sensor-dot"></span>' : ''}
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32]
  });
}


}
