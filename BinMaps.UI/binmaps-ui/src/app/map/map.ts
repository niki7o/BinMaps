import { Component, AfterViewInit } from '@angular/core';
import * as L from 'leaflet';
import 'leaflet.markercluster';

@Component({
  selector: 'app-map',
  standalone: true,
  template: '<div id="map"></div>',
  styleUrls: ['./map.css']
})
export class MapComponent implements AfterViewInit {

  ngAfterViewInit(): void {
    const map = L.map('map').setView([42.6977, 23.3219], 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: 'BinMaps'
    }).addTo(map);

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

  getBinIcon(bin: any): L.Icon {
  let fillClass = 'fill-low';
  if (bin.fillLevel > 70) fillClass = 'fill-high';
  else if (bin.fillLevel > 40) fillClass = 'fill-medium';

  if (bin.status === 'fire') {
    return L.icon({
      iconUrl: '/assets/icons/bin-fire.svg',
      iconSize: [32, 32]
    });
  }

  return L.icon({
    iconUrl: `/assets/icons/bin-${bin.trashType}.svg`,
    iconSize: [28, 28],
    className: `bin-icon ${fillClass} ${bin.hasSensor ? 'has-sensor' : ''}`
  });
}
addLegend(map: L.Map) {
  const legend = new L.Control({ position: 'bottomright' });

  legend.onAdd = () => {
    const div = L.DomUtil.create('div', 'legend');
    div.innerHTML = `
      <h4>Legend</h4>
      <div><img src="/assets/icons/bin-plastic.svg"> Plastic</div>
      <div><img src="/assets/icons/bin-paper.svg"> Paper</div>
      <div><img src="/assets/icons/bin-glass.svg"> Glass</div>
      <div><img src="/assets/icons/bin-mixed.svg"> Mixed</div>
      <hr/>
      <div><span class="box green"></span> Low fill</div>
      <div><span class="box orange"></span> Medium fill</div>
      <div><span class="box red"></span> High fill</div>
      <hr/>
      <div><span class="dot"></span> Sensor</div>
      <div><img src="/assets/icons/bin-fire.svg"> Fire</div>
    `;
    return div;
  };

  legend.addTo(map);
}

}
