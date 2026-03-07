import { Component, AfterViewInit, ViewEncapsulation, inject, OnInit, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, timeout, firstValueFrom } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { AuthUser } from '../services/auth.models';
import { ContainerSignalRService } from '../services/signalr.service';
import { environment } from '../../environments/environment';

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

  private readonly API_URL   = environment.apiUrl;
  private readonly ICONS_DIR = 'assets/icons';

  private map!: L.Map;
  private cluster!: any;
  private allBins: Bin[] = [];
  private activeFilter = { type: 'all', fill: 'all', zone: 'all', sort: 'none' };
  private filterEl?: HTMLElement;
  private routeLine?: L.Polyline;
  private routeMarkers: L.Marker[] = [];
  private truckMarker?: L.Marker;
  private selectedBinForReport: Bin | null = null;
  private destroy$ = new Subject<void>();
  private realRouteCoords: [number, number][] = [];
  private searchMarker?: L.Marker;
  private searchCircles: L.Circle[] = [];

  reportImagePreview:    string | null = null;
  selectedFile:          File | null   = null;
  reportDescription      = '';
  selectedReportType     = 'Full';
  reportSubmitting       = false;
  reportCheckingPhoto    = false;   // true while pre-checking photo with AI
  photoNoBinWarning      = false;   // true when AI detected no bin in selected photo
  photoCheckingPreview   = false;   // true while running quick AI check on selected photo

  navigationMode: 'auto' | 'step' = 'auto';   // 'auto' = animated; 'step' = manual
  stepPending    = false;                       // true when waiting for user to confirm next stop
  private _stepResolve?: () => void;           // resolves the step-wait promise

  currentCollectedStop: {
    id:       number;
    fill:     number;
    load:     number;
    capacity: number;
  } | null = null;


  aiConflictModal: {
    visible:     boolean;
    variant:     'conflict' | 'noBin';
    reportLabel: string;
    aiLabel:     string;
    aiDesc:      string;
    confidence:  number;
  } | null = null;
  private _conflictResolve?: (confirmed: boolean) => void;

  reportResult: {
    reportId: number;
    finalConfidence: number;
    isApproved: boolean | null;
    aiScore: number;
    aiDetectedClass: string;
    userReputation: number;
    message: string;
    hadPhoto: boolean;
    containerDetected: boolean;
  } | null = null;

  get selectedBinHasSensor(): boolean {
    return this.selectedBinForReport?.hasSensor ?? false;
  }

  private http        = inject(HttpClient);
  private router      = inject(Router);
  private route       = inject(ActivatedRoute);
  private authService = inject(AuthService);
  private signalR     = inject(ContainerSignalRService);

  currentUser: AuthUser | null = null;
  isAdmin           = false;
  isDriver          = false;
  isUser            = false;
  isGuest           = true;
  guestBannerVisible = true;
  selectedAreaId    = '';
  selectedTrashType = 0;
  routeResult: RouteResult | null = null;
  routeActive       = false;
  navigationActive  = false;
  showReportPanel   = true;
  showRoutePanel    = true;
  currentStop       = 0;
  currentTruckLoad  = 0;

  private baseLayers: Record<string, L.TileLayer> = {};
  currentMapStyle = localStorage.getItem('mapStyle') || 'standard';
  mapStyles = [
    { key: 'standard',  label: 'Стандартна'  },
    { key: 'voyager',   label: 'Пътеводител' },
    { key: 'satellite', label: 'Сателит'     },
    { key: 'light',     label: 'Светла'      }
  ];


  private binIcon(type: number): string {
    return `${this.ICONS_DIR}/bin-${['mixed', 'plastic', 'paper', 'glass'][type] ?? 'mixed'}.svg`;
  }

  private get fireIcon()          { return `${this.ICONS_DIR}/bin-fire.svg`;           }
  private get burningIcon()       { return `${this.ICONS_DIR}/bin-burning.svg`;        }
  private get brokenIcon()        { return `${this.ICONS_DIR}/bin-broken.svg`;         }
  private get sensorBrokenIcon()  { return `${this.ICONS_DIR}/bin-sensor-broken.svg`;  }
  private get sensorIcon()        { return `${this.ICONS_DIR}/sensor-dot.svg`;         }



  ngOnInit() {
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(u => {
        this.currentUser = u;
        this.syncRole();
      });

    this.signalR.start();

    this.signalR.containerUpdates$.subscribe((updates: any[]) => {
      if (!this.allBins.length) return;

      updates.forEach(u => {
        const b = this.allBins.find(x => x.id === u.id);
        if (!b) return;

        b.fillPercentage = u.fillPercentage;
        b.temperature    = u.temperature ?? null;

        if (u.status   != null)    b.status           = u.status;
        if (u.hasSensor != null)   b.hasSensor        = u.hasSensor;
      });

      this.renderBins(this.filtered());
    });
  }

  ngAfterViewInit() {
    this.initMap();
    this.loadBins();
    this.initFilterControl();

    const refreshId = setInterval(() => {
      if (this.navigationActive) return;

      this.http.get<Bin[]>(`${this.API_URL}/containers`).subscribe({
        next: bins => {
          this.allBins = bins;
          this.renderBins(this.filtered());
        }
      });
    }, 60_000);

    this.destroy$.subscribe({ complete: () => clearInterval(refreshId) });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.navigationActive = false;
    this.signalR.stop();
  }



  private syncRole() {
    if (!this.currentUser) {
      this.isGuest  = true;
      this.isAdmin  = false;
      this.isDriver = false;
      this.isUser   = false;
      return;
    }

    this.isGuest  = false;
    this.isAdmin  = this.currentUser.role === 'Admin';
    this.isDriver = this.currentUser.role === 'Driver';
    this.isUser   = this.currentUser.role === 'User';
  }



  private initMap() {
    this.cluster = L.markerClusterGroup({
      maxClusterRadius: 60,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: true,
      zoomToBoundsOnClick: true,
      disableClusteringAtZoom: 15,
      chunkedLoading: true,
      iconCreateFunction: (c: any) => {
        const n = c.getChildCount();
        const s = n < 10 ? 'small' : n < 50 ? 'medium' : 'large';
        return L.divIcon({
          html: `<div><span>${n}</span></div>`,
          className: `marker-cluster marker-cluster-${s}`,
          iconSize: L.point(40, 40)
        });
      }
    });

    this.map = L.map('map', {
      center: [42.6977, 23.3219],
      zoom: 12,
      minZoom: 11,
      maxZoom: 18,
      maxBounds: [[42.55, 23.15], [42.85, 23.50]],
      maxBoundsViscosity: 0.8
    });

    this.baseLayers['standard']  = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { className: 'map-tiles' });
    this.baseLayers['voyager']   = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png');
    this.baseLayers['satellite'] = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
    this.baseLayers['light']     = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png');

    const saved = localStorage.getItem('mapStyle') || 'standard';
    this.currentMapStyle = saved;
    this.baseLayers[this.currentMapStyle].addTo(this.map);
    this.map.addLayer(this.cluster);
  }

  changeMapStyle(key: string) {
    if (this.currentMapStyle === key) return;
    this.map.removeLayer(this.baseLayers[this.currentMapStyle]);
    this.baseLayers[key].addTo(this.map);
    this.currentMapStyle = key;
    localStorage.setItem('mapStyle', key);
  }



  private loadBins() {
    this.http.get<Bin[]>(`${this.API_URL}/containers`).subscribe({
      next: bins => {
        this.allBins = bins;
        this.renderBins(bins);
        setTimeout(() => this.populateZoneFilter(bins), 250);

        const binParam = this.route.snapshot.queryParamMap.get('bin');
        if (binParam) {
          const targetId = parseInt(binParam, 10);
          const target   = bins.find(b => b.id === targetId);
          if (target) {
            setTimeout(() => this.highlightBin(target), 400);
          }
        }
      },
      error: e => console.error(e)
    });
  }

  private filtered(): Bin[] {
    let b = this.allBins;

    if (this.activeFilter.zone !== 'all') b = b.filter(x => x.areaId === this.activeFilter.zone);
    if (this.activeFilter.type !== 'all') b = b.filter(x => x.trashType === +this.activeFilter.type);

    if (this.activeFilter.fill === 'low')    b = b.filter(x => x.fillPercentage < 40);
    if (this.activeFilter.fill === 'medium') b = b.filter(x => x.fillPercentage >= 40 && x.fillPercentage <= 70);
    if (this.activeFilter.fill === 'high')   b = b.filter(x => x.fillPercentage > 70);

    if (this.activeFilter.sort === 'asc')  b = [...b].sort((a, z) => a.fillPercentage - z.fillPercentage);
    if (this.activeFilter.sort === 'desc') b = [...b].sort((a, z) => z.fillPercentage - a.fillPercentage);

    return b;
  }



  async generateRoute() {
    if (!this.selectedAreaId) {
      alert('Моля изберете зона');
      return;
    }

    const token = this.getToken();
    if (!token) {
      alert('Сесията ви е изтекла');
      this.router.navigate(['/login']);
      return;
    }

    try {
      const res = await this.http.get<RouteResult>(`${this.API_URL}/trucks/route`, {
        params: { areaId: this.selectedAreaId, trashType: this.selectedTrashType.toString() },
        headers: new HttpHeaders({ Authorization: `Bearer ${token}` })
      }).toPromise();

      if (!res?.route?.length) {
        alert(res?.message || 'Няма контейнери за събиране');
        return;
      }


      this.routeResult = res;
      this.routeActive = true;
      await this.visualizeRoute();

    } catch (e: any) {
      if (e.status === 401) {
        alert('Сесията ви е изтекла');
        this.router.navigate(['/login']);
      } else if (e.status === 404) {
        alert('Няма камион в тази зона');
      } else {
        alert('Грешка при генериране на маршрут');
      }
    }
  }

  private routeColor(avg: number): string {
    return avg >= 80 ? '#ef4444'
         : avg >= 60 ? '#f97316'
         : avg >= 40 ? '#f59e0b'
         :             '#10b981';
  }

  private async visualizeRoute() {
    if (!this.routeResult) return;

    this.clearRoute();
    const route = this.routeResult.route;

    try {
      const coords = route.map(s => `${s.locationX},${s.locationY}`).join(';');
      const d = await (await fetch(
        `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`
      )).json();

      if (d.code === 'Ok' && d.routes?.[0]) {
        this.realRouteCoords = d.routes[0].geometry.coordinates.map(
          (c: number[]) => [c[1], c[0]] as [number, number]
        );
      } else {
        this.realRouteCoords = route.map(s => [s.locationY, s.locationX] as [number, number]);
      }
    } catch {
      this.realRouteCoords = route.map(s => [s.locationY, s.locationX] as [number, number]);
    }

    if (this.realRouteCoords.length < 80) {
      this.realRouteCoords = this.interpolateCoords(this.realRouteCoords, 60);
    }

    const avg = route.reduce((s, r) => s + r.fillPercentage, 0) / route.length;

    this.routeLine = L.polyline(this.realRouteCoords, {
      color: this.routeColor(avg),
      weight: 5,
      opacity: 0.85,
      dashArray: '10,5'
    }).addTo(this.map);

    route.forEach(s => {
      const m = L.marker([s.locationY, s.locationX], {
        icon: L.divIcon({
          className: 'route-stop-marker',
          html: `<div class="stop-number">${s.stopNumber}</div>`,
          iconSize:   [32, 32],
          iconAnchor: [16, 16]
        })
      }).addTo(this.map);

      const fc = s.fillPercentage >= 85 ? '#ef4444'
               : s.fillPercentage >= 65 ? '#f97316'
               : s.fillPercentage >= 45 ? '#f59e0b'
               :                          '#10b981';

      m.bindPopup(`
        <div class="bpp">
          <div class="bpp-head">
            <div class="bpp-head-left">
              <img src="${this.binIcon(s.trashType)}" width="20" height="20" alt="контейнер"/>
              <span class="bpp-title">Спирка ${s.stopNumber}</span>
            </div>
            <span class="bpp-badge" style="background:rgba(59,130,246,0.18);color:#60a5fa;border:1px solid rgba(59,130,246,0.28)">#${s.id}</span>
          </div>
          <div class="bpp-fill">
            <div class="bpp-fill-row">
              <span class="bpp-lbl">Запълване</span>
              <span class="bpp-fill-pct" style="color:${fc}">${s.fillPercentage.toFixed(0)}%</span>
            </div>
            <div class="bpp-track">
              <div class="bpp-bar" style="width:${s.fillPercentage}%;background:${fc};box-shadow:0 0 8px ${fc}88"></div>
            </div>
          </div>
          <div class="bpp-rows">
            <div class="bpp-row">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="color:#475569;flex-shrink:0">
                <rect x="2" y="7" width="20" height="14" rx="2"/>
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
              </svg>
              <span>Товар</span>
              <span style="color:#cbd5e1;font-weight:700">${s.estimatedLoad.toFixed(1)} л</span>
            </div>
            <div class="bpp-row">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="color:#475569;flex-shrink:0">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
              <span>Разстояние</span>
              <span style="color:#cbd5e1;font-weight:700">${s.distanceFromPrevious.toFixed(2)} км</span>
            </div>
          </div>
        </div>`, { maxWidth: 280, className: 'bpp-container' });

      this.routeMarkers.push(m);
    });

    this.map.fitBounds(
      L.latLngBounds(route.map(s => [s.locationY, s.locationX] as [number, number]))
    );
  }



  async startNavigation() {
    if (!this.routeResult?.route.length || !this.realRouteCoords.length) {
      alert('Маршрутът не е готов');
      return;
    }

    this.navigationActive = true;
    this.currentStop      = 0;
    this.currentTruckLoad = 0;
    this.stepPending      = false;

    const { truckIcon, path, stopIndices } = this.buildNavSetup();

    if (this.navigationMode === 'step') {
      await this.runStepNavigation(truckIcon, path, stopIndices);
    } else {
      await this.runAutoNavigation(truckIcon, path, stopIndices);
    }
  }

  private buildNavSetup() {
    const route  = this.routeResult!.route;
    const totalKm = this.realRouteCoords.reduce(
      (acc, c, i) => i > 0 ? acc + this.dist(this.realRouteCoords[i - 1], c) : 0, 0
    );

    const FRAMES = Math.max(250, Math.round(totalKm * 70));
    const path   = this.resamplePath(this.realRouteCoords, FRAMES);

    const stopIndices: number[] = route.map(stop => {
      let best = 0, bestD = Infinity;
      path.forEach((coord, idx) => {
        const d = this.dist(coord, [stop.locationY, stop.locationX]);
        if (d < bestD) { bestD = d; best = idx; }
      });
      return best;
    });

    const stride = Math.max(1, Math.floor(FRAMES / (route.length + 1)));
    for (let k = 1; k < stopIndices.length; k++) {
      if (stopIndices[k] <= stopIndices[k - 1]) stopIndices[k] = stopIndices[k - 1] + stride;
      if (stopIndices[k] >= FRAMES)             stopIndices[k] = FRAMES - 1;
    }

    const truckHtml = `
      <div class="truck-marker-wrap">
        <div class="truck-marker-glow"></div>
        <svg class="truck-svg" width="26" height="50" viewBox="0 0 26 50" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3"    y="0"    width="20" height="3"   rx="1.5" fill="#047857"/>
          <rect x="1"    y="3"    width="24" height="13"  rx="2"   fill="#059669"/>
          <rect x="4"    y="4.5"  width="8"  height="9"   rx="1.5" fill="rgba(167,243,208,0.88)"/>
          <rect x="14"   y="4.5"  width="8"  height="9"   rx="1.5" fill="rgba(167,243,208,0.88)"/>
          <rect x="12"   y="4"    width="2"  height="10"  rx="1"   fill="#047857"/>
          <rect x="0"    y="16"   width="26" height="2.5"          fill="#047857"/>
          <rect x="1"    y="18.5" width="24" height="24"  rx="1.5" fill="#10b981"/>
          <rect x="1"    y="24"   width="24" height="1.5"          fill="rgba(0,0,0,0.10)"/>
          <rect x="1"    y="29.5" width="24" height="1.5"          fill="rgba(0,0,0,0.10)"/>
          <rect x="1"    y="35"   width="24" height="1.5"          fill="rgba(0,0,0,0.10)"/>
          <rect x="1"    y="42.5" width="24" height="6.5" rx="1.5" fill="#047857"/>
          <rect x="5"    y="44"   width="16" height="3.5" rx="1"   fill="rgba(0,0,0,0.18)"/>
          <rect x="8"    y="44.5" width="4"  height="2.5" rx="0.5" fill="rgba(255,255,255,0.12)"/>
          <rect x="14"   y="44.5" width="4"  height="2.5" rx="0.5" fill="rgba(255,255,255,0.12)"/>
          <rect x="-1"   y="6"    width="4"  height="9"   rx="2"   fill="#0f172a"/>
          <rect x="-0.5" y="7"    width="3"  height="7"   rx="1.5" fill="#1e293b"/>
          <rect x="23"   y="6"    width="4"  height="9"   rx="2"   fill="#0f172a"/>
          <rect x="23.5" y="7"    width="3"  height="7"   rx="1.5" fill="#1e293b"/>
          <rect x="-1"   y="21"   width="4"  height="8"   rx="2"   fill="#0f172a"/>
          <rect x="-0.5" y="22"   width="3"  height="6"   rx="1.5" fill="#1e293b"/>
          <rect x="-1"   y="31.5" width="4"  height="8"   rx="2"   fill="#0f172a"/>
          <rect x="-0.5" y="32.5" width="3"  height="6"   rx="1.5" fill="#1e293b"/>
          <rect x="23"   y="21"   width="4"  height="8"   rx="2"   fill="#0f172a"/>
          <rect x="23.5" y="22"   width="3"  height="6"   rx="1.5" fill="#1e293b"/>
          <rect x="23"   y="31.5" width="4"  height="8"   rx="2"   fill="#0f172a"/>
          <rect x="23.5" y="32.5" width="3"  height="6"   rx="1.5" fill="#1e293b"/>
        </svg>
      </div>`;

    const truckIcon = L.divIcon({
      className: '', html: truckHtml, iconSize: [56, 56], iconAnchor: [28, 28]
    });

    return { truckIcon, path, stopIndices, FRAMES };
  }

  private doCollectStop(idx: number, route: RouteStop[], token: string | null): void {
    this.currentStop = idx + 1;

    const bin      = this.allBins.find(b => b.id === route[idx].id);
    const capacity = route[idx].capacity > 0 ? route[idx].capacity : 1100;
    const actualFill = bin != null
      ? bin.fillPercentage
      : route[idx].fillPercentage;                 // fallback to route snapshot
    const actualLoad = Math.round((actualFill / 100) * capacity);

    this.currentCollectedStop = {
      id:       route[idx].id,
      fill:     +actualFill.toFixed(1),
      load:     actualLoad,
      capacity: capacity
    };

    this.currentTruckLoad += isFinite(actualLoad) ? actualLoad : 0;

    if (this.routeMarkers[idx]) {
      this.routeMarkers[idx].setIcon(L.divIcon({
        className: 'route-stop-marker-completed',
        html: `<div class="stop-number">✓</div>`,
        iconSize: [32, 32], iconAnchor: [16, 16]
      }));
    }

    if (bin) {
      bin.fillPercentage = Math.random() * 5 + 1;
      if (bin.hasSensor && bin.temperature != null && bin.temperature > 32)
        bin.temperature = +(16 + Math.random() * 8).toFixed(1);
    }

    this.http.put(
      `${this.API_URL}/containers/${route[idx].id}/empty`, {},
      token ? { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) } : {}
    ).toPromise().catch(() => {});
  }

  private panIfNearEdge(coord: [number, number]): void {
    const bounds = this.map.getBounds();
    const [lat, lng] = coord;
    const latR = bounds.getNorth() - bounds.getSouth();
    const lngR = bounds.getEast()  - bounds.getWest();
    const p    = 0.22;

    if (lat < bounds.getSouth() + latR * p || lat > bounds.getNorth() - latR * p
     || lng < bounds.getWest()  + lngR * p || lng > bounds.getEast()  - lngR * p) {
      this.map.panTo(coord, { animate: true, duration: 0.45, easeLinearity: 1 });
    }
  }

  private async runAutoNavigation(
    truckIcon: L.DivIcon,
    path: [number, number][],
    stopIndices: number[]
  ): Promise<void> {
    const route = this.routeResult!.route;
    const token = this.getToken();
    const FRAMES = path.length;

    this.map.panTo(path[0], { animate: true, duration: 0.8 });
    this.truckMarker = L.marker(path[0], { icon: truckIcon, zIndexOffset: 2000 }).addTo(this.map);

    let si = 0;

    for (let i = 0; i < FRAMES; i++) {
      if (!this.navigationActive) break;

      this.truckMarker.setLatLng(path[i]);

      if (i > 0) {
        const deg  = this.bearing(path[i - 1], path[i]);
        const el   = this.truckMarker.getElement();
        const wrap = el?.querySelector('.truck-marker-wrap') as HTMLElement | null;
        if (wrap) wrap.style.transform = `rotate(${deg}deg)`;
      }

      if (i % 20 === 0) this.panIfNearEdge(path[i]);

      let needsRerender = false;
      while (si < route.length && i >= stopIndices[si]) {
        this.doCollectStop(si, route, token);
        needsRerender = true;
        si++;
      }
      if (needsRerender) this.renderBins(this.filtered());

      await new Promise(r => setTimeout(r, 22));
    }

    while (si < route.length) { this.doCollectStop(si, route, token); si++; }
    if (si > 0) this.renderBins(this.filtered());

    this.navigationActive = false;
    const load = this.currentTruckLoad;
    this.currentTruckLoad = 0;
    this.loadBins();   // refresh from server after emptying

    alert(`Маршрут завършен!\nСпирки: ${route.length}\nСъбран товар: ${load.toFixed(0)} л`);
  }

  private async runStepNavigation(
    truckIcon: L.DivIcon,
    path: [number, number][],
    stopIndices: number[]
  ): Promise<void> {
    const route = this.routeResult!.route;
    const token = this.getToken();
    const FRAMES = path.length;

    this.map.panTo(path[0], { animate: true, duration: 0.8 });
    this.truckMarker = L.marker(path[0], { icon: truckIcon, zIndexOffset: 2000 }).addTo(this.map);

    let prevFrame = 0;

    for (let si = 0; si < route.length; si++) {
      if (!this.navigationActive) break;

      const toFrame = stopIndices[si];

      for (let i = prevFrame; i <= toFrame; i++) {
        if (!this.navigationActive) return;

        this.truckMarker.setLatLng(path[i]);

        if (i > 0) {
          const deg  = this.bearing(path[i - 1], path[i]);
          const el   = this.truckMarker.getElement();
          const wrap = el?.querySelector('.truck-marker-wrap') as HTMLElement | null;
          if (wrap) wrap.style.transform = `rotate(${deg}deg)`;
        }

        if (i % 20 === 0) this.panIfNearEdge(path[i]);

        await new Promise(r => setTimeout(r, 22));
      }

      if (!this.navigationActive) break;

      this.doCollectStop(si, route, token);
      this.renderBins(this.filtered());

      if (si < route.length - 1) {
        this.stepPending = true;
        await new Promise<void>(resolve => { this._stepResolve = resolve; });
        this.stepPending = false;
        if (!this.navigationActive) break;
      }

      prevFrame = toFrame + 1;
    }

    if (this.navigationActive) {
      this.navigationActive = false;
      const load = this.currentTruckLoad;
      this.currentTruckLoad = 0;
      this.loadBins();   // refresh from server after emptying

      alert(`Маршрут завършен!\nСпирки: ${route.length}\nСъбран товар: ${load.toFixed(0)} л`);
    }

    this.stepPending = false;
  }

  confirmNextStep(): void {
    this.stepPending = false;
    this._stepResolve?.();
    this._stepResolve = undefined;
  }

  triggerBreakdown(): void {
    const idx      = Math.max(0, this.currentStop - 1);
    const stop     = this.routeResult?.route[idx];
    const zoneName = this.routeResult?.areaId ?? 'Неизвестна зона';
    const stopName = stop
      ? `Контейнер #${stop.id} (Спирка ${this.currentStop})`
      : 'Неизвестно';

    this.navigationActive = false;
    this.stepPending      = false;
    this._stepResolve?.();
    this._stepResolve = undefined;

    this.selectedReportType  = 'TruckProblem';
    this.reportDescription   =
      `🚨 Камионът е повреден в ${zoneName}. Последна спирка: ${stopName}.`;

    this.toggleReportPanel(true);

    this.clearRoute();
    this.routeActive      = false;
    this.routeResult      = null;
    this.currentStop      = 0;
    this.currentTruckLoad = 0;
    this.loadBins();
  }



  stopRoute() {
    this.navigationActive  = false;
    this.clearRoute();
    this.routeResult       = null;
    this.routeActive       = false;
    this.currentStop       = 0;
    this.currentTruckLoad  = 0;
    this.selectedAreaId    = '';
    this.selectedTrashType = 0;
  }

  private clearRoute() {
    if (this.routeLine)   { this.map.removeLayer(this.routeLine);   this.routeLine   = undefined; }
    if (this.truckMarker) { this.map.removeLayer(this.truckMarker); this.truckMarker = undefined; }
    this.routeMarkers.forEach(m => this.map.removeLayer(m));
    this.routeMarkers    = [];
    this.realRouteCoords = [];
    this.clearSearch();
  }

  toggleReportPanel(show: boolean) {
    this.showReportPanel = show;
    setTimeout(() => this.map?.invalidateSize(), 350);
  }

  toggleRoutePanel(show: boolean) {
    this.showRoutePanel = show;
    setTimeout(() => this.map?.invalidateSize(), 350);
  }



  private renderBins(bins: Bin[]) {
    this.cluster.clearLayers();

    bins.forEach(bin => {
      const m = L.marker(
        [bin.locationY, bin.locationX],
        { icon: this.createBinIcon(bin), binId: bin.id } as any
      );

      if (!this.isGuest) {
        m.bindPopup(this.createPopup(bin), { maxWidth: 280, className: 'bpp-container' });
      }

      if ((this.isUser || this.isDriver) && !this.navigationActive) {
        m.on('click', () => {
          this.selectedBinForReport = bin;
          this.reportResult         = null;
          this.reportSubmitting     = false;

          const el = document.getElementById('selected-bin-id') as HTMLInputElement;
          if (el) el.value = `Контейнер #${bin.id}`;
        });
      }

      this.cluster.addLayer(m);
    });
  }



  private createBinIcon(bin: Bin): L.DivIcon {
    const f             = Math.round(bin.fillPercentage);
    const temp          = bin.temperature ?? 0;
    const isFire        = bin.status === 2 || (temp > 55 && bin.fillPercentage > 70);
    const isSensorBroke = !isFire && bin.status === 3;           // SensorBroken status
    const isOffline     = !isFire && bin.status === 1;           // Offline / ContainerDamage
    const isBroken      = isSensorBroke || isOffline;
    const isWarm        = temp > 44 && !isFire;

    const ring = isBroken ? '#94a3b8'
               : f >= 85  ? '#ef4444'
               : f >= 65  ? '#f97316'
               : f >= 45  ? '#f59e0b'
               :             '#10b981';

    const glow = isBroken ? 'rgba(148,163,184,0.5)'
               : f >= 85  ? 'rgba(239,68,68,0.65)'
               : f >= 65  ? 'rgba(249,115,22,0.55)'
               : f >= 45  ? 'rgba(245,158,11,0.50)'
               :             'rgba(16,185,129,0.45)';

    const mainSrc = isFire        ? this.burningIcon
                  : isSensorBroke ? this.sensorBrokenIcon
                  : isOffline     ? this.brokenIcon
                  :                  this.binIcon(bin.trashType);

    const flameCount = isFire ? 3 : isWarm ? 1 : 0;
    const flames = Array.from({ length: flameCount }, (_, i) => `
      <img src="${this.fireIcon}"
           class="bm-flame bm-flame-${i + 1}${isFire ? ' bm-fire' : ' bm-warm'}"
           alt="огън" draggable="false" />`
    ).join('');

    const sensor = bin.hasSensor && !isSensorBroke
      ? `<img src="${this.sensorIcon}" class="bm-sensor" alt="сензор" draggable="false" />`
      : '';

    const tbadge = bin.hasSensor && bin.temperature !== null && !isFire
      ? `<div class="bm-tbadge${isWarm ? ' tbadge-warm' : ''}">${Math.round(bin.temperature!)}°C</div>`
      : '';

    const noSensorLabel = !bin.hasSensor
      ? `<div class="bm-nosensor">Без сензор</div>`
      : '';

    const brokenBadge = isBroken
      ? `<div class="bm-broken-badge">!</div>`
      : '';

    return L.divIcon({
      className: 'bm-host',
      html: `
        <div class="bm${f >= 85 && !isBroken ? ' bm-critical' : ''}${isFire ? ' bm-on-fire' : ''}${isBroken ? ' bm-broken' : ''}">
          ${flames}
          <div class="bm-ring" style="
            background: conic-gradient(${ring} 0% ${f}%, rgba(255,255,255,0.07) ${f}% 100%);
            filter: drop-shadow(0 0 8px ${glow});">
            <div class="bm-inner">
              <img src="${mainSrc}" class="bm-binimg" alt="контейнер" draggable="false" />
            </div>
          </div>
          ${sensor}
          ${tbadge}
          ${noSensorLabel}
          ${brokenBadge}
          <div class="bm-id">#${bin.id}</div>
        </div>`,
      iconSize:   [54, 70],
      iconAnchor: [27, 62]
    });
  }



  private createPopup(bin: Bin): string {
    const f      = bin.fillPercentage;
    const liters = Math.round(f / 100 * 1100);
    const temp   = bin.temperature;
    const isFire = bin.status === 2 || (temp !== null && temp! > 55 && bin.fillPercentage > 70);
    const isWarm = temp !== null && temp! > 44 && !isFire;
    const ring   = f >= 85 ? '#ef4444' : f >= 65 ? '#f97316' : f >= 45 ? '#f59e0b' : '#10b981';

    const typeLbl = ['Смесен', 'Пластмаса', 'Хартия', 'Стъкло'][bin.trashType] ?? '';
    const typeBg  = ['rgba(148,163,184,.18)', 'rgba(245,158,11,.18)', 'rgba(59,130,246,.18)', 'rgba(34,211,238,.18)'][bin.trashType];
    const typeClr = ['#94a3b8', '#f59e0b', '#60a5fa', '#22d3ee'][bin.trashType];

    const tempHtml = bin.hasSensor && temp !== null && !isFire ? `
      <div class="bpp-temp ${isWarm ? 'bpp-temp--warm' : ''}">
        <div class="bpp-temp-left">
          <img src="${this.fireIcon}" class="bpp-fire-icon${isWarm ? '' : ' bpp-fire-icon--hidden'}" alt="огън" />
          <div>
            <div class="bpp-temp-lbl">Температура</div>
            <div class="bpp-temp-val" style="color:${isWarm ? '#f97316' : '#94a3b8'}">
              ${Math.round(temp!)}°C
            </div>
          </div>
        </div>
        ${isWarm ? `<div class="bpp-warn bpp-warn--warm">Повишена темп.</div>` : ''}
      </div>`
    : isFire ? `
      <div class="bpp-temp bpp-temp--fire">
        <div class="bpp-temp-left">
          <img src="${this.fireIcon}" class="bpp-fire-icon" alt="огън" />
          <div>
            <div class="bpp-temp-lbl">Температура</div>
            <div class="bpp-temp-val" style="color:#ef4444">— °C</div>
          </div>
        </div>
        <div class="bpp-warn bpp-warn--fire">🔥 Кофата гори</div>
      </div>`
    : '';

    return `
      <div class="bpp">

        <div class="bpp-head">
          <div class="bpp-head-left">
            <img src="${this.binIcon(bin.trashType)}" width="22" height="22" alt="контейнер" />
            <span class="bpp-title">Контейнер #${bin.id}</span>
          </div>
          <span class="bpp-badge" style="background:${typeBg};color:${typeClr}">${typeLbl}</span>
        </div>

        <div class="bpp-fill">
          <div class="bpp-fill-row">
            <span class="bpp-lbl">Запълване</span>
            <span class="bpp-fill-pct" style="color:${ring};white-space:nowrap">${f.toFixed(0)}% · ${liters} л</span>
          </div>
          <div class="bpp-track">
            <div class="bpp-bar" style="width:${f}%;background:${ring};box-shadow:0 0 10px ${ring}77"></div>
          </div>
        </div>

        ${tempHtml}

        <div class="bpp-rows">
          <div class="bpp-row">
            <img src="${bin.status === 3 ? this.sensorBrokenIcon : this.sensorIcon}" width="16" height="16" alt="сензор" />
            <span>Сензор</span>
            <span style="color:${bin.hasSensor ? (bin.status === 3 ? '#f59e0b' : '#22d3ee') : '#475569'};font-weight:700">
              ${bin.hasSensor ? (bin.status === 3 ? 'Счупен' : 'Активен') : 'Без сензор'}
            </span>
          </div>
          <div class="bpp-row">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="color:#475569;flex-shrink:0">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            <span>Зона</span>
            <span style="color:#cbd5e1;font-weight:600;font-size:11px">${bin.areaId}</span>
          </div>
        </div>

      </div>`;
  }



  private initFilterControl() {
    const self = this;

    const FC = (L.Control as any).extend({
      options: { position: 'topleft' },
      onAdd() {
        const el = L.DomUtil.create('div', 'map-filter-control');
        L.DomEvent.disableClickPropagation(el);

        el.innerHTML = `
          <div class="fc-wrap">

            <button id="fc-toggle" class="fc-toggle" title="Скрий/покажи филтри">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
              </svg>
              <span>Филтри</span>
            </button>

            <div id="fc-body" class="fc-body">

              <div class="fc-search">
                <svg class="fc-search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
                <input id="bin-search-input" type="text" placeholder="Адрес или #62…" class="fc-search-inp"/>
                <button id="bin-search-btn" class="fc-search-go" title="Търси">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </button>
              </div>

              <div class="fc-sep"></div>

              <div class="fc-hdr">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                </svg>
                <span>Филтри</span>
                <button id="fc-reset" class="fc-reset-btn" style="display:none">↺ Изчисти</button>
              </div>

              <div class="fc-block">
                <div class="fc-blk-lbl">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  <span>Зона</span>
                </div>
                <select id="zone-filter" class="fc-select">
                  <option value="all">Всички зони</option>
                </select>
              </div>

              <div class="fc-block">
                <div class="fc-blk-lbl">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                  <span>Тип отпадък</span>
                </div>
                <div class="fc-pills">
                  <button class="fc-pill fc-pill--all active" data-type="all">Всички</button>
                  <button class="fc-pill fc-pill--t0" data-type="0">
                    <span class="fc-dot" style="background:#94a3b8;box-shadow:0 0 4px #94a3b888"></span>Смесен
                  </button>
                  <button class="fc-pill fc-pill--t1" data-type="1">
                    <span class="fc-dot" style="background:#f59e0b;box-shadow:0 0 4px #f59e0b88"></span>Пласт.
                  </button>
                  <button class="fc-pill fc-pill--t2" data-type="2">
                    <span class="fc-dot" style="background:#60a5fa;box-shadow:0 0 4px #60a5fa88"></span>Хартия
                  </button>
                  <button class="fc-pill fc-pill--t3" data-type="3">
                    <span class="fc-dot" style="background:#22d3ee;box-shadow:0 0 4px #22d3ee88"></span>Стъкло
                  </button>
                </div>
              </div>

              <div class="fc-block">
                <div class="fc-blk-lbl">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <line x1="3" y1="17" x2="21" y2="17"/>
                    <line x1="3" y1="12" x2="21" y2="12"/>
                  </svg>
                  <span>Запълване</span>
                </div>
                <div class="fc-pills">
                  <button class="fc-pill fc-pill--fall active" data-fill="all">Всички</button>
                  <button class="fc-pill fc-pill--flow" data-fill="low">
                    <span class="fc-fillbar" style="--fc-fill-w:30%;--fc-fill-c:#10b981"></span>0–39%
                  </button>
                  <button class="fc-pill fc-pill--fmed" data-fill="medium">
                    <span class="fc-fillbar" style="--fc-fill-w:60%;--fc-fill-c:#f59e0b"></span>40–70%
                  </button>
                  <button class="fc-pill fc-pill--fhi" data-fill="high">
                    <span class="fc-fillbar" style="--fc-fill-w:90%;--fc-fill-c:#ef4444"></span>71–100%
                  </button>
                </div>
              </div>

              <div class="fc-block fc-block--last">
                <div class="fc-blk-lbl">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="4"  y1="6"  x2="11" y2="6"/>
                    <line x1="4"  y1="12" x2="11" y2="12"/>
                    <line x1="4"  y1="18" x2="13" y2="18"/>
                    <polyline points="15 9 18 6 21 9"/>
                    <line x1="18" y1="6"  x2="18" y2="18"/>
                  </svg>
                  <span>Сортиране по запълване</span>
                </div>
                <div class="fc-pills">
                  <button class="fc-pill fc-pill--snone active" data-sort="none">По подразбиране</button>
                  <button class="fc-pill fc-pill--sasc" data-sort="asc">
                    <svg class="fc-sort-ico" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="7 11 7 3"/>
                      <polyline points="4 6 7 3 10 6"/>
                    </svg>
                    Ниско → Високо
                  </button>
                  <button class="fc-pill fc-pill--sdesc" data-sort="desc">
                    <svg class="fc-sort-ico" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="7 3 7 11"/>
                      <polyline points="4 8 7 11 10 8"/>
                    </svg>
                    Високо → Ниско
                  </button>
                </div>
              </div>

            </div>
          </div>`;

        self.filterEl = el;

        setTimeout(() => {
          const toggleBtn = el.querySelector('#fc-toggle') as HTMLButtonElement | null;
          const fcBody    = el.querySelector('#fc-body')   as HTMLElement      | null;
          let collapsed   = false;

          toggleBtn?.addEventListener('click', () => {
            collapsed = !collapsed;
            if (fcBody)    fcBody.style.display = collapsed ? 'none' : '';
            if (toggleBtn) toggleBtn.classList.toggle('fc-toggle--collapsed', collapsed);
          });

          const resetBtn = el.querySelector('#fc-reset') as HTMLElement | null;

          const checkReset = () => {
            if (!resetBtn) return;
            const hasFilter = self.activeFilter.type !== 'all'
              || self.activeFilter.fill !== 'all'
              || self.activeFilter.zone !== 'all'
              || self.activeFilter.sort !== 'none';
            resetBtn.style.display = hasFilter ? '' : 'none';
          };

          const doReset = () => {
            self.activeFilter = { type: 'all', fill: 'all', zone: 'all', sort: 'none' };
            el.querySelectorAll('[data-type]').forEach(x => x.classList.toggle('active', x.getAttribute('data-type') === 'all'));
            el.querySelectorAll('[data-fill]').forEach(x => x.classList.toggle('active', x.getAttribute('data-fill') === 'all'));
            el.querySelectorAll('[data-sort]').forEach(x => x.classList.toggle('active', x.getAttribute('data-sort') === 'none'));
            const zSel = el.querySelector('#zone-filter') as HTMLSelectElement | null;
            if (zSel)     zSel.value = 'all';
            if (resetBtn) resetBtn.style.display = 'none';
            self.renderBins(self.filtered());
          };

          resetBtn?.addEventListener('click', doReset);

          const zoneSelect = el.querySelector('#zone-filter') as HTMLSelectElement;
          zoneSelect?.addEventListener('change', e => {
            self.activeFilter.zone = (e.target as HTMLSelectElement).value;
            self.renderBins(self.filtered());
            checkReset();
          });

          el.querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', e => {
            const v = (e.currentTarget as HTMLElement).getAttribute('data-type')!;
            self.activeFilter.type = v;
            el.querySelectorAll('[data-type]').forEach(x => x.classList.remove('active'));
            (e.currentTarget as HTMLElement).classList.add('active');
            self.renderBins(self.filtered());
            checkReset();
          }));

          el.querySelectorAll('[data-fill]').forEach(b => b.addEventListener('click', e => {
            const v = (e.currentTarget as HTMLElement).getAttribute('data-fill')!;
            self.activeFilter.fill = v;
            el.querySelectorAll('[data-fill]').forEach(x => x.classList.remove('active'));
            (e.currentTarget as HTMLElement).classList.add('active');
            self.renderBins(self.filtered());
            checkReset();
          }));

          el.querySelectorAll('[data-sort]').forEach(b => b.addEventListener('click', e => {
            const v = (e.currentTarget as HTMLElement).getAttribute('data-sort')!;
            self.activeFilter.sort = v;
            el.querySelectorAll('[data-sort]').forEach(x => x.classList.remove('active'));
            (e.currentTarget as HTMLElement).classList.add('active');
            self.renderBins(self.filtered());
            checkReset();
          }));

          const searchInput = el.querySelector('#bin-search-input') as HTMLInputElement;
          const searchBtn   = el.querySelector('#bin-search-btn')   as HTMLButtonElement;
          const doSearch    = () => self.searchNearestBin(searchInput.value);

          searchBtn?.addEventListener('click', doSearch);
          searchInput?.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') doSearch();
          });

        }, 120);

        return el;
      }
    });

    new FC().addTo(this.map);
  }

  private populateZoneFilter(bins: Bin[]) {
    if (!this.filterEl) return;

    const select = this.filterEl.querySelector('#zone-filter') as HTMLSelectElement;
    if (!select) return;

    const zones = [...new Set(bins.map(b => b.areaId))].sort();
    select.innerHTML = '<option value="all">Всички зони</option>';

    zones.forEach(z => {
      const opt       = document.createElement('option');
      opt.value       = z;
      opt.textContent = z;
      select.appendChild(opt);
    });
  }



  async searchNearestBin(query: string) {
    if (!query.trim()) return;

    const q = query.trim();
    this.clearSearch();

    if (/^#\d+$/.test(q)) {
      const bin = this.allBins.find(b => b.id === parseInt(q.slice(1), 10));
      if (bin) { this.highlightBin(bin); return; }
      alert(`Контейнер ${q} не е намерен`);
      return;
    }

    let lat: number, lon: number;

    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ', София, България')}&format=json&limit=1&accept-language=bg`;
      const res = await (await fetch(url)).json();
      if (!res?.length) { alert('Адресът не е намерен'); return; }
      lat = parseFloat(res[0].lat);
      lon = parseFloat(res[0].lon);
    } catch {
      alert('Грешка при геокодиране');
      return;
    }

    this.searchMarker = L.marker([lat, lon], {
      icon: L.divIcon({
        className: '',
        html: `<div class="search-pin">
                 <div class="search-pin-ring"></div>
                 <div class="search-pin-ring search-pin-ring--2"></div>
                 <div class="search-pin-dot"></div>
               </div>`,
        iconSize:   [40, 40],
        iconAnchor: [20, 20]
      }),
      zIndexOffset: 1500
    }).addTo(this.map);

    const RADIUS_M     = 500;
    const radiusCircle = L.circle([lat, lon], {
      radius:      RADIUS_M,
      color:       '#3b82f6',
      weight:      1.5,
      opacity:     0.55,
      fill:        true,
      fillColor:   '#3b82f6',
      fillOpacity: 0.04,
      dashArray:   '8 5'
    } as any).addTo(this.map);

    this.searchCircles.push(radiusCircle);

    const nearby: Bin[] = [];

    this.allBins.forEach(bin => {
      const dm = this.dist([lat, lon], [bin.locationY, bin.locationX]) * 1000;
      if (dm > RADIUS_M) return;

      nearby.push(bin);

      const c = L.circle([bin.locationY, bin.locationX], {
        radius:      22,
        color:       '#f59e0b',
        weight:      2.5,
        opacity:     0.9,
        fill:        true,
        fillColor:   '#f59e0b',
        fillOpacity: 0.18,
        className:   'bin-nearby-circle'
      } as any).addTo(this.map);

      c.on('click', () => {
        this.selectedBinForReport = bin;
        const el = document.getElementById('selected-bin-id') as HTMLInputElement;
        if (el) el.value = `Контейнер #${bin.id}`;
      });

      this.searchCircles.push(c);
    });

    this.map.flyToBounds(
      L.latLngBounds([[lat - 0.006, lon - 0.008], [lat + 0.006, lon + 0.008]]),
      { animate: true, duration: 0.9 }
    );

    if (nearby.length === 1) setTimeout(() => this.highlightBin(nearby[0]), 1100);
  }

  private clearSearch() {
    if (this.searchMarker) {
      this.map.removeLayer(this.searchMarker);
      this.searchMarker = undefined;
    }
    this.searchCircles.forEach(c => this.map.removeLayer(c));
    this.searchCircles = [];
  }

  private highlightBin(bin: Bin) {
    this.map.setView([bin.locationY, bin.locationX], 17, { animate: true, duration: 0.7 });

    setTimeout(() => {
      let found: any = null;
      this.cluster.eachLayer((layer: any) => {
        if (layer.options?.binId === bin.id) found = layer;
      });
      if (found) this.cluster.zoomToShowLayer(found, () => found.openPopup());
    }, 850);
  }


  handleImagePreview(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/gif'].includes(file.type)) {
      alert('Само JPEG/PNG/GIF');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Максимум 5MB');
      return;
    }

    this.selectedFile      = file;
    this.photoNoBinWarning = false;   // reset warning for new file

    const r    = new FileReader();
    r.onload   = (e: any) => { this.reportImagePreview = e.target.result; };
    r.readAsDataURL(file);

    const token = this.getToken();
    if (token) {
      this.photoCheckingPreview = true;
      const checkFd = new FormData();
      checkFd.append('photo', file);
      this.http.post<any>(`${this.API_URL}/reports/analyze`, checkFd, {
        headers: new HttpHeaders({ Authorization: `Bearer ${token}` })
      }).pipe(timeout(8_000), takeUntil(this.destroy$)).subscribe({
        next: res => {
          this.photoCheckingPreview = false;
          this.photoNoBinWarning    = !(res?.container_detected ?? true);
        },
        error: () => { this.photoCheckingPreview = false; }
      });
    }
  }

  clearImagePreview() {
    this.reportImagePreview  = null;
    this.selectedFile        = null;
    this.photoNoBinWarning   = false;
    this.photoCheckingPreview = false;
    const el = document.getElementById('report-image') as HTMLInputElement;
    if (el) el.value = '';
  }

  async submitReport() {
    if (this.reportSubmitting || this.reportCheckingPhoto) return;

    if (!this.currentUser) {
      alert('Влезте в системата');
      this.router.navigate(['/login']);
      return;
    }

    const desc           = document.getElementById('report-description') as HTMLTextAreaElement;
    const reportType     = this.selectedReportType;
    const isTruckProblem = reportType === 'TruckProblem';

    if (!isTruckProblem && !this.selectedBinForReport) {
      alert('Изберете контейнер');
      return;
    }

    const token = this.getToken();
    if (!token) {
      alert('Сесията ви е изтекла');
      this.router.navigate(['/login']);
      return;
    }

    const isAiReport = reportType === 'Full' || reportType === 'Fire';
    if (this.selectedFile && isAiReport) {
      this.reportCheckingPhoto = true;
      try {
        const checkFd = new FormData();
        checkFd.append('photo', this.selectedFile);

        const check = await firstValueFrom(
          this.http.post<any>(`${this.API_URL}/reports/analyze`, checkFd, {
            headers: new HttpHeaders({ Authorization: `Bearer ${token}` })
          }).pipe(timeout(8_000))
        );

        this.reportCheckingPhoto = false;

        const containerDetected: boolean = check?.container_detected ?? true;
        const detectedClass: string      = check?.detected_class     ?? '';
        const confidence: number         = check?.confidence         ?? 0;

        if (!containerDetected) {
          const proceed = await this.showAiModal('noBin', '', '', '', 0);
          if (!proceed) return;
        }

        else if (detectedClass && confidence > 0) {
          const classInfo         = this.getAiClassInfo(detectedClass);
          const conflictsWithFire = reportType === 'Fire' &&
            ['clean', 'moderate', 'full', 'damaged'].includes(detectedClass);
          const conflictsWithFull = reportType === 'Full' &&
            ['clean', 'moderate'].includes(detectedClass);

          if (conflictsWithFire || conflictsWithFull) {
            const reportLabel = reportType === 'Fire' ? '🔥 ПОЖАР' : '📦 ПРЕПЪЛНЕН';
            const proceed = await this.showAiModal(
              'conflict',
              reportLabel,
              classInfo.label,
              classInfo.description,
              confidence
            );
            if (!proceed) return;
          }
        }
      } catch {
        this.reportCheckingPhoto = false;
      }
    }

    const typeMap: Record<string, number> = {
      Full: 0, Fire: 1, SensorBroken: 2, TruckProblem: 3, ContainerDamage: 4
    };

    const fd = new FormData();

    if (this.selectedBinForReport) {
      fd.append('TrashContainerId', this.selectedBinForReport.id.toString());
    } else if (isTruckProblem) {
      fd.append('TrashContainerId', '0');
    }

    fd.append('ReportType', (typeMap[reportType] ?? 0).toString());

    if (desc?.value)       fd.append('Description', desc.value);
    if (this.selectedFile) fd.append('Photo', this.selectedFile);

    const hadPhoto        = !!this.selectedFile;
    this.reportSubmitting = true;

    this.http
      .post<any>(`${this.API_URL}/reports`, fd, {
        headers: new HttpHeaders({ Authorization: `Bearer ${token}` })
      })
      .subscribe({
        next: res => {
          this.reportSubmitting     = false;
          this.reportResult         = {
            ...res,
            hadPhoto,
            containerDetected: res.containerDetected ?? true
          };
          this.selectedBinForReport = null;
          this.reportImagePreview   = null;
          this.selectedFile         = null;
          this.reportDescription    = '';
          this.selectedReportType   = 'Full';

          const si = document.getElementById('selected-bin-id') as HTMLInputElement;
          if (si)   si.value   = '';
          if (desc) desc.value = '';

          setTimeout(() => this.loadBins(), 800);
        },
        error: e => {
          this.reportSubmitting = false;

          if (e.status === 401) {
            alert('Сесията изтекла');
            this.router.navigate(['/login']);
          } else {
            alert('Грешка при изпращане');
          }
        }
      });
  }

  clearReportResult() {
    this.reportResult = null;
  }



  /** Opens the in-page conflict/noBin modal and resolves when the user
   *  clicks Confirm (true) or Cancel (false). */
  private showAiModal(
    variant:     'conflict' | 'noBin',
    reportLabel: string,
    aiLabel:     string,
    aiDesc:      string,
    confidence:  number
  ): Promise<boolean> {
    this.aiConflictModal = { visible: true, variant, reportLabel, aiLabel, aiDesc, confidence };
    return new Promise(resolve => { this._conflictResolve = resolve; });
  }

  confirmAiModal(): void {
    this._conflictResolve?.(true);
    this.aiConflictModal = null;
  }

  cancelAiModal(): void {
    this._conflictResolve?.(false);
    this.aiConflictModal = null;
  }

  getAiClassInfo(cls: string): { label: string; description: string } {
    const map: Record<string, { label: string; description: string }> = {
      clean:    {
        label:       'Чиста кофа',
        description: 'кофата изглежда почти празна или чиста — без видими признаци на препълване или пожар'
      },
      moderate: {
        label:       'Умерено запълнена',
        description: 'кофата е умерено запълнена (около 40–70%) — не е спешна за събиране'
      },
      full: {
        label:       'Препълнена',
        description: 'кофата е почти пълна или препълнена (над 85%) — нуждае се от събиране'
      },
      fire: {
        label:       '🔥 Пожар / Горяща кофа',
        description: 'открити са ясни признаци на горене, пламъци или задимяване'
      },
      damaged: {
        label:       'Повредена кофа',
        description: 'кофата изглежда физически повредена, деформирана или съборена'
      },
    };
    return map[cls] ?? { label: cls, description: 'неизвестен резултат от AI' };
  }



  private resamplePath(coords: [number, number][], count: number): [number, number][] {
    if (coords.length < 2) return coords;

    const cum = [0];
    for (let i = 1; i < coords.length; i++) {
      cum.push(cum[i - 1] + this.dist(coords[i - 1], coords[i]));
    }

    const total = cum[cum.length - 1];
    if (total === 0) return coords;

    const out: [number, number][] = [];

    for (let k = 0; k < count; k++) {
      const d  = (k / (count - 1)) * total;
      let lo   = 0;
      let hi   = cum.length - 1;

      while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= d) lo = mid; else hi = mid;
      }

      const t         = (cum[hi] - cum[lo]) > 0 ? (d - cum[lo]) / (cum[hi] - cum[lo]) : 0;
      const [la, ln]  = coords[lo];
      const [lb, ln2] = coords[hi];
      out.push([la + (lb - la) * t, ln + (ln2 - ln) * t]);
    }

    return out;
  }

  private bearing(a: [number, number], b: [number, number]): number {
    const [la, lo]  = a.map(x => x * Math.PI / 180);
    const [lb, lo2] = b.map(x => x * Math.PI / 180);
    const y = Math.sin(lo2 - lo) * Math.cos(lb);
    const x = Math.cos(la) * Math.sin(lb) - Math.sin(la) * Math.cos(lb) * Math.cos(lo2 - lo);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  private interpolateCoords(coords: [number, number][], steps = 50): [number, number][] {
    if (coords.length < 2) return coords;

    const out: [number, number][] = [];

    for (let i = 0; i < coords.length - 1; i++) {
      const [la, lo]  = coords[i];
      const [lb, lb2] = coords[i + 1];

      for (let t = 0; t < steps; t++) {
        const r = t / steps;
        out.push([la + (lb - la) * r, lo + (lb2 - lo) * r]);
      }
    }

    out.push(coords[coords.length - 1]);
    return out;
  }

  private dist(a: [number, number], b: [number, number]): number {
    const R    = 6371;
    const dLat = (b[0] - a[0]) * Math.PI / 180;
    const dLon = (b[1] - a[1]) * Math.PI / 180;
    const x    = Math.sin(dLat / 2) ** 2
               + Math.cos(a[0] * Math.PI / 180)
               * Math.cos(b[0] * Math.PI / 180)
               * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  private getToken(): string | null {
    return this.authService.getToken();
  }

}