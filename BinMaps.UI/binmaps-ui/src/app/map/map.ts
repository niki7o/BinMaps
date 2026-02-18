// ════════════════════════════════════════════════════════════
// COMPLETE MAP.COMPONENT.TS — Всички fix-ове приложени
// ════════════════════════════════════════════════════════════
// 
// ПРОМЕНИ:
// ✅ Report описание + preview
// ✅ Admin simulation скрит
// ✅ Better clustering
// ✅ Route color според urgency
// ✅ Improved icons (sensor pulse, fire flicker)
// ✅ Image preview handler
// ════════════════════════════════════════════════════════════

import { Component, AfterViewInit, ViewEncapsulation, inject, OnInit, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../services/auth.service';
import * as L from 'leaflet';
import 'leaflet.markercluster';
import { ContainerSignalRService } from '../services/signalr.service';

interface User {
  userName: string;
  email: string;
  role: string;
}

interface Bin {
  id: number;
  areaId: string;
  trashType: number;
  fillPercentage: number;
  temperature: number | null;
  hasSensor: boolean;
  status: number | null;
  locationX: number;
  locationY: number;
}

interface RouteResult {
  truckId: number;
  areaId: string;
  trashType: number;
  route: RouteStop[];
  totalDistance: number;
  totalLoad: number;
  truckCapacity: number;
  capacityUtilization: number;
  containersCount: number;
  estimatedTimeMinutes: number;
  message: string;
}

interface RouteStop {
  id: number;
  areaId: string;
  capacity: number;
  fillPercentage: number;
  hasSensor: boolean;
  locationX: number;
  locationY: number;
  temperature: number | null;
  trashType: number;
  status: number | null;
  stopNumber: number;
  distanceFromPrevious: number;
  estimatedLoad: number;
}

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './map.html',
  styleUrls: ['./map.css'],
  encapsulation: ViewEncapsulation.None
})
export class MapComponent implements AfterViewInit, OnInit, OnDestroy {

  private readonly API_URL = 'https://localhost:7277/api';
  private map!: L.Map;
  
  // ⚡ IMPROVED CLUSTERING
  private cluster = L.markerClusterGroup({
    maxClusterRadius: 60,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: true,
    zoomToBoundsOnClick: true,
    disableClusteringAtZoom: 15,
    chunkedLoading: true,
    iconCreateFunction: (cluster) => {
      const count = cluster.getChildCount();
      let className = 'marker-cluster marker-cluster-';
      
      if (count < 10) className += 'small';
      else if (count < 50) className += 'medium';
      else className += 'large';

      return L.divIcon({
        html: `<div><span>${count}</span></div>`,
        className: className,
        iconSize: L.point(40, 40)
      });
    }
  });
  
  private allBins: Bin[] = [];
  private routeLine?: L.Polyline;
  private routeMarkers: L.Marker[] = [];
  private truckMarker?: L.Marker;
  private selectedBinForReport: Bin | null = null;
  private destroy$ = new Subject<void>();
  private navigationInterval?: number;
  private realRouteCoordinates: [number, number][] = [];
  
  // ⚡ REPORT IMPROVEMENTS
  reportImagePreview: string | null = null;
  reportDescription: string = '';

  private http = inject(HttpClient);
  private router = inject(Router);
  private authService = inject(AuthService);
  private signalR = inject(ContainerSignalRService);
  
  currentUser: User | null = null;
  isAdmin = false;
  isDriver = false;
  isUser = false;
  isGuest = true;
  
  selectedAreaId: string = '';
  selectedTrashType: number = 0;
  routeResult: RouteResult | null = null;
  routeActive = false;
  navigationActive = false;
  currentStop = 0;
  currentTruckLoad = 0;

  private baseLayers: { [key: string]: L.TileLayer } = {};
  currentMapStyle: string = 'standard';

  mapStyles = [
    { key: 'standard', label: 'Standard' },
    { key: 'dark', label: 'Dark' },
    { key: 'terrain', label: 'Terrain' },
    { key: 'satellite', label: 'Satellite' }
  ];

  ngOnInit() {
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        this.currentUser = user;
        this.updateUserRole();
      });

    this.signalR.start();

    this.signalR.containerUpdates$.subscribe(updates => {
      this.handleContainerUpdates(updates);
    });
  }

  ngAfterViewInit(): void {
    this.initializeMap();
    this.loadBins();
    this.initMapControls();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopNavigation();
    this.signalR.stop();
  }

  private updateUserRole() {
    if (!this.currentUser) {
      this.isGuest = true;
      this.isAdmin = false;
      this.isDriver = false;
      this.isUser = false;
    } else {
      this.isGuest = false;
      this.isAdmin = this.currentUser.role === 'Admin';
      this.isDriver = this.currentUser.role === 'Driver';
      this.isUser = this.currentUser.role === 'User';
    }
  }

  private initializeMap() {
    const sofiaCenter: L.LatLngExpression = [42.6977, 23.3219];

    this.map = L.map('map', {
      center: sofiaCenter,
      zoom: 12,
      minZoom: 11,
      maxZoom: 18,
      maxBounds: [
        [42.55, 23.15],
        [42.85, 23.50]
      ],
      maxBoundsViscosity: 0.8
    });

    this.baseLayers['standard'] = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { className: 'map-tiles' }
    );

    this.baseLayers['dark'] = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    );

    this.baseLayers['terrain'] = L.tileLayer(
      'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
    );

    this.baseLayers['satellite'] = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    );

    const savedStyle = localStorage.getItem('mapStyle') || 'standard';
    this.currentMapStyle = savedStyle;

    this.baseLayers[this.currentMapStyle].addTo(this.map);
    this.map.addLayer(this.cluster);
  }

  private initMapControls() {
    this.initFilterControl();
  }

  changeMapStyle(styleKey: string) {
    if (this.currentMapStyle === styleKey) return;

    this.map.removeLayer(this.baseLayers[this.currentMapStyle]);
    this.baseLayers[styleKey].addTo(this.map);

    this.currentMapStyle = styleKey;
    localStorage.setItem('mapStyle', styleKey);
  }

  private loadBins() {
    this.http.get<Bin[]>(`${this.API_URL}/containers`).subscribe({
      next: (bins) => {
        this.allBins = bins;
        this.renderBins(this.allBins);
      },
      error: (err) => console.error('Error loading bins:', err)
    });
  }

  async generateRoute() {
    if (!this.selectedAreaId) {
      alert('Моля изберете зона');
      return;
    }

    try {
      const token = this.getAuthToken();
      if (!token) {
        alert('Сесията ви е изтекла');
        this.router.navigate(['/login']);
        return;
      }

      console.log(`Generating route: Area=${this.selectedAreaId}, TrashType=${this.selectedTrashType}`);

      const response = await this.http.get<RouteResult>(
        `${this.API_URL}/trucks/route`,
        {
          params: {
            areaId: this.selectedAreaId,
            trashType: this.selectedTrashType.toString()
          },
          headers: new HttpHeaders({
            'Authorization': `Bearer ${token}`
          })
        }
      ).toPromise();

      if (!response) {
        alert('Грешка при генериране на маршрут');
        return;
      }

      if (!response.route || response.route.length === 0) {
        alert(response.message || 'Няма контейнери за събиране');
        return;
      }

      this.routeResult = response;
      this.routeActive = true;
      this.visualizeRoute();

      console.log('Route generated successfully:', response);

    } catch (error: any) {
      console.error('Route generation error:', error);
      
      if (error.status === 401) {
        alert('Сесията ви е изтекла');
        this.router.navigate(['/login']);
      } else if (error.status === 404) {
        alert('Няма наличен камион в тази зона');
      } else {
        alert('Грешка при генериране на маршрут');
      }
    }
  }

  // ⚡ ROUTE COLOR HELPER
  private getRouteColor(avgFill: number): string {
    if (avgFill >= 80) return '#ef4444'; // Red - critical
    if (avgFill >= 60) return '#f97316'; // Orange - high
    if (avgFill >= 40) return '#f59e0b'; // Yellow - medium
    return '#10b981';                     // Green - normal
  }

  private async visualizeRoute() {
    if (!this.routeResult) return;

    this.clearRouteVisualization();

    const route = this.routeResult.route;

    // ⚡ OSRM Routing
    try {
      const coords = route.map(s => `${s.locationX},${s.locationY}`).join(';');
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
      
      const response = await fetch(osrmUrl);
      const data = await response.json();

      if (data.code === 'Ok' && data.routes && data.routes[0]) {
        this.realRouteCoordinates = data.routes[0].geometry.coordinates
          .map((c: number[]) => [c[1], c[0]] as [number, number]);

        // ⚡ ROUTE COLOR според urgency
        const avgFill = route.reduce((sum, s) => sum + s.fillPercentage, 0) / route.length;
        const routeColor = this.getRouteColor(avgFill);

        this.routeLine = L.polyline(this.realRouteCoordinates, {
          color: routeColor,
          weight: 5,
          opacity: 0.85,
          dashArray: '10, 5'
        }).addTo(this.map);

        console.log(`✅ Route: ${(data.routes[0].distance / 1000).toFixed(1)} km, Avg fill: ${avgFill.toFixed(0)}%, Color: ${routeColor}`);
      } else {
        console.warn('OSRM failed, using straight lines');
        this.fallbackStraightRoute(route);
      }
    } catch (error) {
      console.error('Routing error:', error);
      this.fallbackStraightRoute(route);
    }

    // Stop markers
    route.forEach((stop) => {
      const marker = L.marker([stop.locationY, stop.locationX], {
        icon: L.divIcon({
          className: 'route-stop-marker',
          html: `<div class="stop-number">${stop.stopNumber}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        })
      }).addTo(this.map);

      marker.bindPopup(`
        <div class="route-popup">
          <strong>Спирка ${stop.stopNumber}</strong>
          <p>Контейнер #${stop.id}</p>
          <p>Пълнота: ${stop.fillPercentage}%</p>
          <p>Товар: ${stop.estimatedLoad.toFixed(1)} л</p>
        </div>
      `);

      this.routeMarkers.push(marker);
    });

    this.map.fitBounds(L.latLngBounds(route.map(s => [s.locationY, s.locationX] as [number, number])));
  }

  private fallbackStraightRoute(route: RouteStop[]) {
    this.realRouteCoordinates = route.map(s => [s.locationY, s.locationX] as [number, number]);
    
    const avgFill = route.reduce((sum, s) => sum + s.fillPercentage, 0) / route.length;
    const routeColor = this.getRouteColor(avgFill);
    
    this.routeLine = L.polyline(this.realRouteCoordinates, {
      color: routeColor,
      weight: 5,
      opacity: 0.85,
      dashArray: '10, 5'
    }).addTo(this.map);
  }

  async startNavigation() {
    if (!this.routeResult || !this.routeResult.route.length) {
      alert('Няма активен маршрут');
      return;
    }

    if (!this.realRouteCoordinates || this.realRouteCoordinates.length === 0) {
      alert('Маршрутът не е готов');
      return;
    }

    this.navigationActive = true;
    this.currentStop = 0;
    this.currentTruckLoad = 0;

    const truckIcon = L.divIcon({
      className: 'truck-marker-active',
      html: `
        <div class="truck-icon">
          <svg viewBox="0 0 24 24" fill="#3b82f6" stroke="white" stroke-width="1.5">
            <rect x="1" y="3" width="15" height="13"/>
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
            <circle cx="5.5" cy="18.5" r="2.5"/>
            <circle cx="18.5" cy="18.5" r="2.5"/>
          </svg>
        </div>
      `,
      iconSize: [48, 48],
      iconAnchor: [24, 24]
    });

    let currentStopIndex = 0;
    const route = this.routeResult.route;

    for (let i = 0; i < this.realRouteCoordinates.length; i++) {
      if (!this.navigationActive) break;

      const coord = this.realRouteCoordinates[i];

      if (this.truckMarker) {
        this.map.removeLayer(this.truckMarker);
      }

      this.truckMarker = L.marker(coord, { icon: truckIcon }).addTo(this.map);
      this.map.panTo(coord);

      if (currentStopIndex < route.length) {
        const stop = route[currentStopIndex];
        const distance = this.calculateDistance(coord, [stop.locationY, stop.locationX]);

        if (distance < 0.05) {
          this.currentStop = currentStopIndex + 1;
          this.currentTruckLoad += stop.estimatedLoad;

          console.log(`Stop ${currentStopIndex + 1}: Container #${stop.id}, Load: ${this.currentTruckLoad.toFixed(0)} л`);

          try {
            await this.http.put(`${this.API_URL}/containers/${stop.id}/empty`, {}).toPromise();
            console.log(`Container #${stop.id} emptied`);
          } catch (err) {
            console.error(`Error emptying #${stop.id}:`, err);
          }

          currentStopIndex++;
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const finalLoad = this.currentTruckLoad;
    this.navigationActive = false;

    alert(`Маршрут завършен!\nОбщо събран товар: ${finalLoad.toFixed(0)} л\n\nКамионът се връща в базата за изпразване...`);

    this.currentTruckLoad = 0;
    console.log('Navigation completed. Truck emptied at depot.');
  }

  private calculateDistance(coord1: [number, number], coord2: [number, number]): number {
    const R = 6371;
    const dLat = (coord2[0] - coord1[0]) * Math.PI / 180;
    const dLon = (coord2[1] - coord1[1]) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(coord1[0] * Math.PI / 180) * Math.cos(coord2[0] * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  private stopNavigation() {
    this.navigationActive = false;
    if (this.navigationInterval) {
      clearInterval(this.navigationInterval);
      this.navigationInterval = undefined;
    }
  }

  stopRoute() {
    this.stopNavigation();
    this.clearRouteVisualization();
    this.routeResult = null;
    this.routeActive = false;
    this.currentStop = 0;
    this.currentTruckLoad = 0;
    this.selectedAreaId = '';
    this.selectedTrashType = 0;
  }

  private clearRouteVisualization() {
    if (this.routeLine) {
      this.map.removeLayer(this.routeLine);
      this.routeLine = undefined;
    }

    if (this.truckMarker) {
      this.map.removeLayer(this.truckMarker);
      this.truckMarker = undefined;
    }

    this.routeMarkers.forEach(marker => this.map.removeLayer(marker));
    this.routeMarkers = [];
    this.realRouteCoordinates = [];
  }

  // ════════════════════════════════════════════════════════════
  // SIGNALR
  // ════════════════════════════════════════════════════════════

  private handleContainerUpdates(updates: any[]) {
    if (!this.allBins || !this.allBins.length) return;

    updates.forEach(update => {
      const bin = this.allBins.find(b => b.id === update.id);
      if (!bin) return;

      bin.fillPercentage = update.fillPercentage;
      bin.temperature = update.temperature;
      if (update.status !== null && update.status !== undefined) {
        bin.status = update.status;
      }

      this.updateMarkerOnMap(bin);
    });

    console.log(`✅ SignalR: Updated ${updates.length} bins`);
  }

  private updateMarkerOnMap(bin: Bin) {
    this.cluster.eachLayer((layer: any) => {
      if (layer.options && layer.options.binId === bin.id) {
        layer.setIcon(this.createBinIcon(bin));
        
        const popup = layer.getPopup();
        if (popup) {
          popup.setContent(this.createPopupContent(bin));
        }
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // RENDERING
  // ════════════════════════════════════════════════════════════

  private renderBins(bins: Bin[]) {
    this.cluster.clearLayers();
    
    bins.forEach(bin => {
      const marker = L.marker(
        [bin.locationY, bin.locationX],
        { 
          icon: this.createBinIcon(bin),
          binId: bin.id
        } as any
      );

      marker.bindPopup(this.createPopupContent(bin));

      if (this.isUser || this.isDriver) {
        marker.on('click', () => {
          this.selectedBinForReport = bin;
          this.updateReportForm(bin);
        });
      }

      this.cluster.addLayer(marker);
    });
  }

  private createBinIcon(bin: Bin): L.DivIcon {
    const fillColor = this.getFillColor(bin.fillPercentage);
    const isFire = bin.status === 1 || (bin.temperature !== null && bin.temperature > 55);
    const typeIconPath = this.getTypeIconPath(bin.trashType);
    
    return L.divIcon({
      className: 'custom-bin-marker',
      html: `
        <div class="bin-marker ${isFire ? 'fire' : ''}">
          <div class="bin-id">#${bin.id}</div>
          <div class="bin-icon-wrapper" style="border-color: ${fillColor};">
            <img src="${typeIconPath}" class="bin-type-icon" alt="Bin"/>
            <div class="fill-indicator-ring" style="background: conic-gradient(${fillColor} ${bin.fillPercentage}%, transparent ${bin.fillPercentage}%);"></div>
            ${bin.hasSensor ? '<div class="sensor-dot"></div>' : ''}
            ${isFire ? '<div class="fire-icon">🔥</div>' : ''}
          </div>
        </div>
      `,
      iconSize: [50, 50],
      iconAnchor: [25, 25]
    });
  }

  private getTypeIconPath(type: number): string {
    const icons: { [key: number]: string } = {
      0: 'assets/icons/bin-mixed.svg',
      1: 'assets/icons/bin-plastic.svg',
      2: 'assets/icons/bin-paper.svg',
      3: 'assets/icons/bin-glass.svg'
    };
    return icons[type] || icons[0];
  }

  private getFillColor(fillPercentage: number): string {
    if (fillPercentage >= 80) return '#ef4444';
    if (fillPercentage >= 50) return '#f59e0b';
    return '#10b981';
  }

  private createPopupContent(bin: Bin): string {
    const typeNames = ['Смесен', 'Пластмаса', 'Хартия', 'Стъкло'];
    const statusNames = ['Активен', 'Пожар', 'Повреден', 'Offline'];
    
    return `
      <div class="bin-popup">
        <div class="popup-header">
          <h3>Контейнер #${bin.id}</h3>
          <span class="popup-badge">${typeNames[bin.trashType]}</span>
        </div>
        <div class="popup-body">
          <div class="popup-stat">
            <span class="stat-label">Запълване</span>
            <div class="stat-bar">
              <div class="stat-fill" style="width: ${bin.fillPercentage}%; background: ${this.getFillColor(bin.fillPercentage)}"></div>
              <span class="stat-value">${bin.fillPercentage}%</span>
            </div>
          </div>
          ${bin.temperature !== null ? `
            <div class="popup-stat">
              <span class="stat-label">Температура</span>
              <span class="stat-value">${bin.temperature}°C</span>
            </div>
          ` : ''}
          <div class="popup-stat">
            <span class="stat-label">Сензор</span>
            <span class="stat-value">${bin.hasSensor ? '✓ Активен' : '✗ Няма'}</span>
          </div>
          ${bin.status !== null ? `
            <div class="popup-stat">
              <span class="stat-label">Статус</span>
              <span class="stat-value">${statusNames[bin.status]}</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // ════════════════════════════════════════════════════════════
  // FILTERS
  // ════════════════════════════════════════════════════════════

  private initFilterControl() {
    const filterControl = (L.Control as any).extend({
      options: { position: 'topleft' },
      onAdd: () => {
        const container = L.DomUtil.create('div', 'map-filter-control');
        L.DomEvent.disableClickPropagation(container);
        
        container.innerHTML = `
          <div class="filter-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
            <span>Филтри</span>
          </div>
          <div class="filter-section">
            <label class="filter-label">Тип отпадък</label>
            <div class="filter-options">
              <button class="filter-btn active" data-type="all"><span>Всички</span></button>
              <button class="filter-btn" data-type="1"><span>Пластмаса</span></button>
              <button class="filter-btn" data-type="2"><span>Хартия</span></button>
              <button class="filter-btn" data-type="3"><span>Стъкло</span></button>
              <button class="filter-btn" data-type="0"><span>Смесен</span></button>
            </div>
          </div>
          <div class="filter-section">
            <label class="filter-label">Ниво на запълване</label>
            <div class="filter-options">
              <button class="filter-btn active" data-fill="all"><span>Всички</span></button>
              <button class="filter-btn" data-fill="low"><span>< 40%</span></button>
              <button class="filter-btn" data-fill="medium"><span>40-70%</span></button>
              <button class="filter-btn" data-fill="high"><span>> 70%</span></button>
            </div>
          </div>
        `;

        setTimeout(() => this.attachFilterEvents(container), 100);
        return container;
      }
    });

    new filterControl().addTo(this.map);
  }

  private attachFilterEvents(container: HTMLElement) {
    container.querySelectorAll('[data-type]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = (e.currentTarget as HTMLElement).getAttribute('data-type');
        this.applyFilter('type', type);
        this.updateActiveButton(container, '[data-type]', e.currentTarget as HTMLElement);
      });
    });

    container.querySelectorAll('[data-fill]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const fill = (e.currentTarget as HTMLElement).getAttribute('data-fill');
        this.applyFilter('fill', fill);
        this.updateActiveButton(container, '[data-fill]', e.currentTarget as HTMLElement);
      });
    });
  }

  private updateActiveButton(container: HTMLElement, selector: string, activeBtn: HTMLElement) {
    container.querySelectorAll(selector).forEach(btn => btn.classList.remove('active'));
    activeBtn.classList.add('active');
  }

  private applyFilter(type: string, value: any) {
    let filtered = this.allBins;

    if (type === 'type' && value !== 'all') {
      filtered = filtered.filter(b => b.trashType === Number(value));
    }

    if (type === 'fill' && value !== 'all') {
      if (value === 'low') filtered = filtered.filter(b => b.fillPercentage < 40);
      if (value === 'medium') filtered = filtered.filter(b => b.fillPercentage >= 40 && b.fillPercentage <= 70);
      if (value === 'high') filtered = filtered.filter(b => b.fillPercentage > 70);
    }

    this.renderBins(filtered);
  }

  // ════════════════════════════════════════════════════════════
  // REPORTS — С ОПИСАНИЕ И ПРЕВЮ
  // ════════════════════════════════════════════════════════════

  private updateReportForm(bin: Bin) {
    const input = document.getElementById('selected-bin-id') as HTMLInputElement;
    if (input) {
      input.value = `Контейнер #${bin.id}`;
    }
  }

  // ⚡ IMAGE PREVIEW HANDLER
  handleImagePreview(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      alert('Моля качете само JPEG, PNG или GIF снимки');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Снимката е твърде голяма. Максимум 5MB.');
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.reportImagePreview = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ⚡ CLEAR IMAGE
  clearImagePreview() {
    this.reportImagePreview = null;
    const fileInput = document.getElementById('report-image') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  submitReport() {
    if (!this.currentUser) {
      alert('Моля влезте в системата');
      this.router.navigate(['/login']);
      return;
    }

    if (!this.selectedBinForReport) {
      alert('Моля изберете контейнер');
      return;
    }

    const reportTypeSelect = document.getElementById('report-type') as HTMLSelectElement;
    const imageInput = document.getElementById('report-image') as HTMLInputElement;
    const descriptionInput = document.getElementById('report-description') as HTMLTextAreaElement;

    const reportTypeMap: { [key: string]: number } = {
      'Full': 0, 'Fire': 1, 'SensorBroken': 2,
      'TruckProblem': 3, 'ContainerDamage': 4
    };

    const reportTypeValue = reportTypeMap[reportTypeSelect.value] ?? 0;
    const formData = new FormData();
    formData.append('TrashContainerId', this.selectedBinForReport.id.toString());
    formData.append('ReportType', reportTypeValue.toString());
    
    
    if (descriptionInput?.value) {
      formData.append('Description', descriptionInput.value);
    }
    
    if (imageInput.files && imageInput.files[0]) {
      formData.append('Photo', imageInput.files[0]);
    }

    const token = this.getAuthToken();
    if (!token) {
      alert('Сесията ви е изтекла');
      this.router.navigate(['/login']);
      return;
    }

    this.http.post(`${this.API_URL}/reports`, formData, {
      headers: new HttpHeaders({ 'Authorization': `Bearer ${token}` })
    }).subscribe({
      next: () => {
        alert('Докладването е изпратено успешно!');
        this.selectedBinForReport = null;
        this.reportImagePreview = null;
        this.reportDescription = '';
        
        const input = document.getElementById('selected-bin-id') as HTMLInputElement;
        if (input) input.value = '';
        
        if (imageInput) imageInput.value = '';
        if (descriptionInput) descriptionInput.value = '';
      },
      error: (error) => {
        if (error.status === 401) {
          alert('Сесията ви е изтекла');
          this.router.navigate(['/login']);
        } else {
          alert('Грешка при изпращане');
        }
      }
    });
  }

  private getAuthToken(): string | null {
    return localStorage.getItem('token') || 
           JSON.parse(localStorage.getItem('user') || '{}').token || 
           null;
  }
}