import { Component, AfterViewInit } from '@angular/core';
import * as L from 'leaflet';
import 'leaflet.markercluster';

@Component({
  selector: 'app-map',
  standalone: true,
  template: '<div id="map" style="height: 100vh;"></div>',
})
export class MapComponent implements AfterViewInit {

  ngAfterViewInit(): void {
  
    const iconDefault = L.icon({
     iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      tooltipAnchor: [16, -28],
      shadowSize: [41, 41]
    });
    L.Marker.prototype.options.icon = iconDefault;

    const map = L.map('map').setView([42.6977, 23.3219], 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: 'BinMaps'
    }).addTo(map);

    this.loadBins(map);
  }

  loadBins(map: L.Map) {

    fetch('assets/data/trash-containers.json')
      .then(res => res.json())
      .then(data => this.renderClusters(map, data))
      .catch(err => console.error('Data load error:', err));
  }

  renderClusters(map: L.Map, bins: any[]) {
    // 2. FIX: Cast L to any so TypeScript allows .markerClusterGroup()
    const clusterGroup = (L as any).markerClusterGroup();

    bins.forEach(bin => {
      const marker = L.marker([bin.latitude, bin.longitude]);

      marker.bindPopup(`
        <b>${bin.address}</b><br/>
        Район: ${bin.area}<br/>
        Запълване: ${bin.fillLevel}%<br/>
        Статус: ${bin.status}
      `);

      clusterGroup.addLayer(marker);
    });

    map.addLayer(clusterGroup);
  }
}