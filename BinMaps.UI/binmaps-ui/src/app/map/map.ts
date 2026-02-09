import { Component, AfterViewInit, ViewEncapsulation, inject, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../auth.service';
import * as L from 'leaflet';
import 'leaflet.markercluster';

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

interface RoutePoint {
  id: number;
  locationX: number;
  locationY: number;
  fillPercentage: number;
}

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './map.html',
  styleUrls: ['./map.css'],
  encapsulation: ViewEncapsulation.None
})
export class MapComponent implements AfterViewInit, OnInit, OnDestroy {
  private map!: L.Map;
  private cluster = L.markerClusterGroup({
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true
  });
  
  private allBins: Bin[] = [];
  private routeLine?: L.Polyline;
  private routeMarkers: L.Marker[] = [];
  private truckMarker?: L.Marker;
  private selectedBinForReport: Bin | null = null;
  private destroy$ = new Subject<void>();
  private currentAnimationInterval?: number;

  private http = inject(HttpClient);
  private router = inject(Router);
  private authService = inject(AuthService);

  currentUser: User | null = null;
  isAdmin = false;
  isDriver = false;
  isUser = false;
  isGuest = true;

  selectedAreaId: string = '';
  selectedTrashType: number = 0;

  ngOnInit() {
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        this.currentUser = user;
        this.updateUserRole();
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.currentAnimationInterval) {
      clearInterval(this.currentAnimationInterval);
    }
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

  logout() {
    this.authService.logout();
    this.router.navigate(['/']);
  }

  ngAfterViewInit(): void {
    this.initializeMap();
    this.loadBins();
    this.initMapControls();
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

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      className: 'map-tiles'
    }).addTo(this.map);

    this.map.addLayer(this.cluster);
  }

  private initMapControls() {
    this.initFilterControl();
    
    if (this.isDriver || this.isAdmin) {
      this.initRouteControl();
    }
  }

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
              <button class="filter-btn" data-type="all">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>
                <span>Всички</span>
              </button>
              <button class="filter-btn" data-type="1">
                <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                <span>Пластмаса</span>
              </button>
              <button class="filter-btn" data-type="2">
                <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16c0 1 1 2 2 2h12c1 0 2-1 2-2V8l-6-6z"/></svg>
                <span>Хартия</span>
              </button>
              <button class="filter-btn" data-type="3">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
                <span>Стъкло</span>
              </button>
              <button class="filter-btn" data-type="0">
                <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                <span>Смесен</span>
              </button>
            </div>
          </div>
          <div class="filter-section">
            <label class="filter-label">Ниво на запълване</label>
            <div class="filter-options">
              <button class="filter-btn" data-fill="all">
                <div class="fill-indicator all"></div>
                <span>Всички</span>
              </button>
              <button class="filter-btn" data-fill="low">
                <div class="fill-indicator low"></div>
                <span>< 40%</span>
              </button>
              <button class="filter-btn" data-fill="medium">
                <div class="fill-indicator medium"></div>
                <span>40-70%</span>
              </button>
              <button class="filter-btn" data-fill="high">
                <div class="fill-indicator high"></div>
                <span>> 70%</span>
              </button>
            </div>
          </div>
          <div class="filter-section">
            <button class="filter-btn sensor-filter" data-sensor="true">
              <div class="sensor-indicator active"></div>
              <span>Само със сензор</span>
            </button>
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

    container.querySelector('[data-sensor]')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLElement;
      btn.classList.toggle('active');
      this.applyFilter('sensor', btn.classList.contains('active'));
    });
  }

  private updateActiveButton(container: HTMLElement, selector: string, activeBtn: HTMLElement) {
    container.querySelectorAll(selector).forEach(btn => btn.classList.remove('active'));
    activeBtn.classList.add('active');
  }

  private initRouteControl() {
    const routeControl = (L.Control as any).extend({
      options: { position: 'topright' },
      onAdd: () => {
        const container = L.DomUtil.create('div', 'route-control');
        L.DomEvent.disableClickPropagation(container);
        
        container.innerHTML = `
          <div class="route-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="1" y="3" width="15" height="13"/>
              <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
              <circle cx="5.5" cy="18.5" r="2.5"/>
              <circle cx="18.5" cy="18.5" r="2.5"/>
            </svg>
            <span>${this.isDriver ? 'Навигация' : 'Маршрут'}</span>
          </div>
          <div class="route-content">
            <select class="route-select" id="area-select">
              <option value="">Избери зона</option>
            </select>
            <select class="route-select" id="type-select">
              <option value="0">Смесен</option>
              <option value="1">Пластмаса</option>
              <option value="2">Хартия</option>
              <option value="3">Стъкло</option>
            </select>
            <button class="route-btn-start" id="start-route-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              <span>Старт</span>
            </button>
            <button class="route-btn-stop hidden" id="stop-route-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="6" y="6" width="12" height="12"/>
              </svg>
              <span>Стоп</span>
            </button>
          </div>
        `;

        setTimeout(() => this.loadAreasForRoute(container), 100);
        return container;
      }
    });

    new routeControl().addTo(this.map);
  }

  private loadAreasForRoute(container: HTMLElement) {
    this.http.get<Bin[]>('https://localhost:7277/api/containers').subscribe(bins => {
      const uniqueAreas = [...new Set(bins.map(b => b.areaId))].sort();
      const select = container.querySelector('#area-select') as HTMLSelectElement;
      
      uniqueAreas.forEach(area => {
        const option = document.createElement('option');
        option.value = area;
        option.textContent = area;
        select.appendChild(option);
      });

      container.querySelector('#start-route-btn')?.addEventListener('click', () => {
        const areaId = (container.querySelector('#area-select') as HTMLSelectElement).value;
        const trashType = Number((container.querySelector('#type-select') as HTMLSelectElement).value);
        
        if (areaId) {
          this.startRouteNavigation(areaId, trashType);
          this.toggleRouteButtons(container, true);
        }
      });

      container.querySelector('#stop-route-btn')?.addEventListener('click', () => {
        this.stopRoute();
        this.toggleRouteButtons(container, false);
      });
    });
  }

  private toggleRouteButtons(container: HTMLElement, isRouteActive: boolean) {
    const startBtn = container.querySelector('#start-route-btn');
    const stopBtn = container.querySelector('#stop-route-btn');
    
    if (isRouteActive) {
      startBtn?.classList.add('hidden');
      stopBtn?.classList.remove('hidden');
    } else {
      startBtn?.classList.remove('hidden');
      stopBtn?.classList.add('hidden');
    }
  }

  private loadBins() {
    this.http.get<Bin[]>('https://localhost:7277/api/containers').subscribe(bins => {
      this.allBins = bins;
      this.renderBins(this.allBins);
    });
  }

  private renderBins(bins: Bin[]) {
    this.cluster.clearLayers();
    
    bins.forEach(bin => {
      const marker = L.marker(
        [bin.locationY, bin.locationX],
        { icon: this.createBinIcon(bin) }
      );

      const popupContent = this.createPopupContent(bin);
      marker.bindPopup(popupContent);

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
    const typeIcon = this.getTypeIcon(bin.trashType);
    
    return L.divIcon({
      className: 'custom-bin-marker',
      html: `
        <div class="bin-marker ${isFire ? 'fire' : ''}">
          <div class="bin-id">#${bin.id}</div>
          <div class="bin-icon-wrapper" style="border-color: ${fillColor}; box-shadow: 0 0 12px ${fillColor}80;">
            ${typeIcon}
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

  private getTypeIcon(type: number): string {
    const icons: { [key: number]: string } = {
      0: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
      1: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
      2: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16c0 1 1 2 2 2h12c1 0 2-1 2-2V8l-6-6z"/></svg>',
      3: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>'
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
          <span class="popup-badge type-${bin.trashType}">${typeNames[bin.trashType]}</span>
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
              <span class="stat-value ${bin.temperature > 50 ? 'danger' : ''}">${bin.temperature}°C</span>
            </div>
          ` : ''}
          <div class="popup-stat">
            <span class="stat-label">Сензор</span>
            <span class="stat-value">${bin.hasSensor ? '✓ Активен' : '✗ Няма'}</span>
          </div>
          ${bin.status !== null ? `
            <div class="popup-stat">
              <span class="stat-label">Статус</span>
              <span class="stat-value status-${bin.status}">${statusNames[bin.status]}</span>
            </div>
          ` : ''}
        </div>
        ${(this.isUser || this.isDriver) ? `
          <div class="popup-footer">
            <button class="popup-btn" onclick="window.selectBinForReport(${bin.id})">
              Докладване
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  private updateReportForm(bin: Bin) {
    const input = document.getElementById('selected-bin-id') as HTMLInputElement;
    if (input) {
      input.value = `Контейнер #${bin.id}`;
    }
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

    if (type === 'sensor' && value === true) {
      filtered = filtered.filter(b => b.hasSensor);
    }

    this.renderBins(filtered);
  }

  private startRouteNavigation(areaId: string, trashType: number) {
    const encodedArea = encodeURIComponent(areaId);
    
    this.http.get<RoutePoint[]>(`https://localhost:7277/api/Trucks/route-by-area/${encodedArea}/${trashType}`)
      .subscribe({
        next: (points) => {
          if (!points || points.length === 0) {
            alert('Няма контейнери за събиране в тази зона');
            return;
          }

          this.createRouteVisualization(points);
        },
        error: (err) => {
          console.error('Route error:', err);
          alert('Грешка при зареждане на маршрут');
        }
      });
  }

  private createRouteVisualization(points: RoutePoint[]) {
    this.stopRoute();

    const coords = points.map(p => `${p.locationX},${p.locationY}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`;

    this.http.get<any>(url).subscribe({
      next: (response) => {
        if (response.code === 'Ok' && response.routes && response.routes.length > 0) {
          const coordinates = response.routes[0].geometry.coordinates.map((c: number[]) => [c[1], c[0]] as L.LatLngExpression);
          this.animateRoute(coordinates, points);
          this.map.fitBounds(L.latLngBounds(coordinates));
        }
      },
      error: (err) => {
        console.error('OSRM error:', err);
        this.createSimpleRoute(points);
      }
    });
  }

  private createSimpleRoute(points: RoutePoint[]) {
    const coordinates = points.map(p => [p.locationY, p.locationX] as L.LatLngExpression);
    this.animateRoute(coordinates, points);
    this.map.fitBounds(L.latLngBounds(coordinates));
  }

  private animateRoute(path: L.LatLngExpression[], points: RoutePoint[]) {
    this.routeLine = L.polyline(path, {
      color: '#059669',
      weight: 4,
      opacity: 0.7,
      dashArray: '10, 5'
    }).addTo(this.map);

    points.forEach((point, index) => {
      const marker = L.marker([point.locationY, point.locationX], {
        icon: L.divIcon({
          className: 'route-point-marker',
          html: `
            <div class="route-point">
              <div class="route-number">${index + 1}</div>
            </div>
          `,
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        })
      }).addTo(this.map);

      marker.bindPopup(`
        <div class="route-popup">
          <strong>Точка ${index + 1}</strong>
          <p>Контейнер #${point.id}</p>
          <p>Запълване: ${point.fillPercentage}%</p>
        </div>
      `);

      this.routeMarkers.push(marker);
    });

    const truckIcon = L.divIcon({
      className: 'truck-marker',
      html: `
        <div class="truck-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="1" y="3" width="15" height="13"/>
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
            <circle cx="5.5" cy="18.5" r="2.5"/>
            <circle cx="18.5" cy="18.5" r="2.5"/>
          </svg>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });

    this.truckMarker = L.marker(path[0], { icon: truckIcon }).addTo(this.map);

    let currentIndex = 0;
    this.currentAnimationInterval = window.setInterval(() => {
      if (currentIndex >= path.length) {
        if (this.currentAnimationInterval) {
          clearInterval(this.currentAnimationInterval);
        }
        return;
      }

      this.truckMarker?.setLatLng(path[currentIndex]);
      currentIndex++;
    }, 50);
  }

  private stopRoute() {
    if (this.currentAnimationInterval) {
      clearInterval(this.currentAnimationInterval);
      this.currentAnimationInterval = undefined;
    }

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
  }

  submitReport() {
    if (!this.currentUser) {
      alert('Моля влезте в системата за да докладвате проблем');
      this.router.navigate(['/login']);
      return;
    }

    if (!this.selectedBinForReport) {
      alert('Моля изберете контейнер от картата');
      return;
    }

    const reportTypeSelect = document.getElementById('report-type') as HTMLSelectElement;
    const imageInput = document.getElementById('report-image') as HTMLInputElement;

    const formData = new FormData();
    formData.append('TrashContainerId', this.selectedBinForReport.id.toString());
    formData.append('ReportType', reportTypeSelect.value);

    if (imageInput.files && imageInput.files[0]) {
      formData.append('Photo', imageInput.files[0]);
    }

    const token = localStorage.getItem('token');
    
    fetch('https://localhost:7277/api/reports', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    })
    .then(response => response.json())
    .then(result => {
      alert('Докладването е изпратено успешно!');
      this.selectedBinForReport = null;
      
      const input = document.getElementById('selected-bin-id') as HTMLInputElement;
      if (input) input.value = '';
      reportTypeSelect.value = 'Full';
      imageInput.value = '';
    })
    .catch(error => {
      console.error('Error:', error);
      alert('Възникна грешка при изпращането');
    });
  }

  getInitials(name: string): string {
    if (!name) return 'U';
    const parts = name.split(' ').filter(p => p.length > 0);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }
}