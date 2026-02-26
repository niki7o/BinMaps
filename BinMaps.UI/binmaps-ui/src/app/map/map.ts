import { Component, AfterViewInit, ViewEncapsulation, inject, OnInit, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { AuthUser } from '../services/auth.models';
import * as L from 'leaflet';
import 'leaflet.markercluster';
import { ContainerSignalRService } from '../services/signalr.service';
import { environment } from '../../environments/environment';

interface Bin {
  id: number; areaId: string; trashType: number; fillPercentage: number;
  temperature: number | null; hasSensor: boolean; status: number | null;
  locationX: number; locationY: number;
}
interface RouteResult {
  truckId: number; areaId: string; trashType: number; route: RouteStop[];
  totalDistance: number; totalLoad: number; truckCapacity: number;
  capacityUtilization: number; containersCount: number;
  estimatedTimeMinutes: number; message: string;
}
interface RouteStop {
  id: number; areaId: string; capacity: number; fillPercentage: number;
  hasSensor: boolean; locationX: number; locationY: number;
  temperature: number | null; trashType: number; status: number | null;
  stopNumber: number; distanceFromPrevious: number; estimatedLoad: number;
}

@Component({
  selector: 'app-map', standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './map.html',
  styleUrls: ['./map.css', './map.css'],
  encapsulation: ViewEncapsulation.None
})
export class MapComponent implements AfterViewInit, OnInit, OnDestroy {

  private readonly API_URL   = environment.apiUrl;
  private readonly ICONS_DIR = 'assets/icons';

  private map!: L.Map;
  private cluster = L.markerClusterGroup({
    maxClusterRadius: 60, spiderfyOnMaxZoom: true,
    showCoverageOnHover: true, zoomToBoundsOnClick: true,
    disableClusteringAtZoom: 15, chunkedLoading: true,
    iconCreateFunction: (c) => {
      const n = c.getChildCount();
      const s = n < 10 ? 'small' : n < 50 ? 'medium' : 'large';
      return L.divIcon({ html: `<div><span>${n}</span></div>`, className: `marker-cluster marker-cluster-${s}`, iconSize: L.point(40, 40) });
    }
  });

  private allBins: Bin[]     = [];
  private activeFilter       = { type: 'all', fill: 'all', zone: 'all' };
  private filterEl?: HTMLElement;
  private routeLine?:          L.Polyline;
  private routeMarkers:        L.Marker[] = [];
  private truckMarker?:        L.Marker;
  private selectedBinForReport: Bin | null = null;
  private destroy$           = new Subject<void>();
  private realRouteCoords:     [number, number][] = [];
  private searchMarker?:       L.Marker;
  private searchCircles:       L.Circle[] = [];

  reportImagePreview: string | null = null;
  reportDescription  = '';

  private http        = inject(HttpClient);
  private router      = inject(Router);
  private authService = inject(AuthService);
  private signalR     = inject(ContainerSignalRService);

  currentUser: AuthUser | null = null;
  isAdmin = false; isDriver = false; isUser = false; isGuest = true;
  selectedAreaId = ''; selectedTrashType = 0;
  routeResult: RouteResult | null = null;
  routeActive    = false;
  navigationActive = false;
  showReportPanel = true;
  showRoutePanel  = true;
  currentStop    = 0;
  currentTruckLoad = 0;

  private baseLayers: Record<string, L.TileLayer> = {};
  currentMapStyle = 'standard';
  mapStyles = [
    { key: 'standard',  label: 'Standard'  },
    { key: 'dark',      label: 'Dark'      },
    { key: 'terrain',   label: 'Terrain'   },
    { key: 'satellite', label: 'Satellite' }
  ];

  
  private binIcon(type: number) { return `${this.ICONS_DIR}/bin-${['mixed','plastic','paper','glass'][type] ?? 'mixed'}.svg`; }
  private get fireIcon()   { return `${this.ICONS_DIR}/bin-fire.svg`; }
  private get sensorIcon() { return `${this.ICONS_DIR}/sensor-dot.svg`; }
  private get truckSvg()   { return `${this.ICONS_DIR}/truck.svg`; }


  ngOnInit() {
    this.authService.currentUser$.pipe(takeUntil(this.destroy$)).subscribe(u => {
      this.currentUser = u; this.syncRole();
    });
    this.signalR.start();

    this.signalR.containerUpdates$.subscribe((updates: any[]) => {
      if (!this.allBins.length) return;
      updates.forEach(u => {
        const b = this.allBins.find(x => x.id === u.id);
        if (!b) return;
        b.fillPercentage = u.fillPercentage;
        b.temperature    = u.temperature ?? b.temperature;
        if (u.status != null) b.status = u.status;
      });
      this.renderBins(this.filtered());
    });
  }

  ngAfterViewInit() { this.initMap(); this.loadBins(); this.initFilterControl(); }

  ngOnDestroy() {
    this.destroy$.next(); this.destroy$.complete();
    this.navigationActive = false; this.signalR.stop();
  }

  private syncRole() {
    if (!this.currentUser) {
      this.isGuest = true; this.isAdmin = this.isDriver = this.isUser = false;
    } else {
      this.isGuest  = false;
      this.isAdmin  = this.currentUser.role === 'Admin';
      this.isDriver = this.currentUser.role === 'Driver';
      this.isUser   = this.currentUser.role === 'User';
    }
  }


  private initMap() {
    this.map = L.map('map', {
      center: [42.6977, 23.3219], zoom: 12, minZoom: 11, maxZoom: 18,
      maxBounds: [[42.55, 23.15], [42.85, 23.50]], maxBoundsViscosity: 0.8
    });
    this.baseLayers['standard']  = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { className: 'map-tiles' });
    this.baseLayers['dark']      = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png');
    this.baseLayers['terrain']   = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png');
    this.baseLayers['satellite'] = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
    const saved = localStorage.getItem('mapStyle') || 'dark';
    this.currentMapStyle = saved;
    this.baseLayers[this.currentMapStyle].addTo(this.map);
    this.map.addLayer(this.cluster);
  }

  changeMapStyle(key: string) {
    if (this.currentMapStyle === key) return;
    this.map.removeLayer(this.baseLayers[this.currentMapStyle]);
    this.baseLayers[key].addTo(this.map);
    this.currentMapStyle = key; localStorage.setItem('mapStyle', key);
  }

  private loadBins() {
    this.http.get<Bin[]>(`${this.API_URL}/containers`).subscribe({
      next: bins => {
        this.allBins = bins;
        this.renderBins(bins);
        setTimeout(() => this.populateZoneFilter(bins), 250);
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
    return b;
  }

  // ── Route ────────────────────────────────────────────────────────────────
  async generateRoute() {
    if (!this.selectedAreaId) { alert('Моля изберете зона'); return; }
    const token = this.getToken();
    if (!token) { alert('Сесията ви е изтекла'); this.router.navigate(['/login']); return; }
    try {
      const res = await this.http.get<RouteResult>(`${this.API_URL}/trucks/route`, {
        params: { areaId: this.selectedAreaId, trashType: this.selectedTrashType.toString() },
        headers: new HttpHeaders({ Authorization: `Bearer ${token}` })
      }).toPromise();
      if (!res?.route?.length) { alert(res?.message || 'Няма контейнери за събиране'); return; }
      this.routeResult = res; this.routeActive = true;
      await this.visualizeRoute();
    } catch (e: any) {
      if (e.status === 401) { alert('Сесията ви е изтекла'); this.router.navigate(['/login']); }
      else if (e.status === 404) alert('Няма камион в тази зона');
      else alert('Грешка при генериране на маршрут');
    }
  }

  private routeColor(avg: number) {
    return avg >= 80 ? '#ef4444' : avg >= 60 ? '#f97316' : avg >= 40 ? '#f59e0b' : '#10b981';
  }

  private async visualizeRoute() {
    if (!this.routeResult) return;
    this.clearRoute();
    const route = this.routeResult.route;
    try {
      const coords = route.map(s => `${s.locationX},${s.locationY}`).join(';');
      const d = await (await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`)).json();
      if (d.code === 'Ok' && d.routes?.[0])
        this.realRouteCoords = d.routes[0].geometry.coordinates.map((c: number[]) => [c[1], c[0]] as [number, number]);
      else this.realRouteCoords = route.map(s => [s.locationY, s.locationX] as [number, number]);
    } catch {
      this.realRouteCoords = route.map(s => [s.locationY, s.locationX] as [number, number]);
    }

    // Ensure smooth truck animation: if OSRM gave few points (or fallback), interpolate
    if (this.realRouteCoords.length < 80) {
      this.realRouteCoords = this.interpolateCoords(this.realRouteCoords, 60);
    }

    const avg = route.reduce((s, r) => s + r.fillPercentage, 0) / route.length;
    this.routeLine = L.polyline(this.realRouteCoords, {
      color: this.routeColor(avg), weight: 5, opacity: 0.85, dashArray: '10,5'
    }).addTo(this.map);

    route.forEach(s => {
      const m = L.marker([s.locationY, s.locationX], {
        icon: L.divIcon({
          className: 'route-stop-marker',
          html: `<div class="stop-number">${s.stopNumber}</div>`,
          iconSize: [32, 32], iconAnchor: [16, 16]
        })
      }).addTo(this.map);
      const fc = s.fillPercentage >= 85 ? '#ef4444' : s.fillPercentage >= 65 ? '#f97316' : s.fillPercentage >= 45 ? '#f59e0b' : '#10b981';
      m.bindPopup(`
        <div class="bpp">
          <div class="bpp-head">
            <div class="bpp-head-left">
              <img src="${this.binIcon(s.trashType)}" width="20" height="20" alt="bin"/>
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
            <div class="bpp-row"><span>📦</span><span>Товар</span><span style="color:#cbd5e1;font-weight:700">${s.estimatedLoad.toFixed(1)} л</span></div>
            <div class="bpp-row"><span>📍</span><span>Разстояние</span><span style="color:#cbd5e1;font-weight:700">${s.distanceFromPrevious.toFixed(2)} км</span></div>
          </div>
        </div>`, { maxWidth: 280, className: 'bpp-container' });
      this.routeMarkers.push(m);
    });
    this.map.fitBounds(L.latLngBounds(route.map(s => [s.locationY, s.locationX] as [number, number])));
  }

  async startNavigation() {
    if (!this.routeResult?.route.length || !this.realRouteCoords.length) {
      alert('Маршрутът не е готов'); return;
    }
    this.navigationActive = true; this.currentStop = 0; this.currentTruckLoad = 0;
    const route = this.routeResult.route;
    const token = this.getToken();

    // ── Detailed top-down garbage truck SVG ─────────────────────────────────
    const truckHtml = `
      <div class="truck-marker-wrap">
        <div class="truck-marker-glow"></div>
        <svg class="truck-svg" width="26" height="50" viewBox="0 0 26 50" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Cab front bumper -->
          <rect x="3" y="0" width="20" height="3" rx="1.5" fill="#047857"/>
          <!-- Cab body -->
          <rect x="1" y="3" width="24" height="13" rx="2" fill="#059669"/>
          <!-- Split windshield -->
          <rect x="4" y="4.5" width="8" height="9" rx="1.5" fill="rgba(167,243,208,0.88)"/>
          <rect x="14" y="4.5" width="8" height="9" rx="1.5" fill="rgba(167,243,208,0.88)"/>
          <!-- Windshield divider -->
          <rect x="12" y="4" width="2" height="10" rx="1" fill="#047857"/>
          <!-- Cab/body separator -->
          <rect x="0" y="16" width="26" height="2.5" fill="#047857"/>
          <!-- Cargo body -->
          <rect x="1" y="18.5" width="24" height="24" rx="1.5" fill="#10b981"/>
          <!-- Cargo ribs -->
          <rect x="1" y="24" width="24" height="1.5" fill="rgba(0,0,0,0.10)"/>
          <rect x="1" y="29.5" width="24" height="1.5" fill="rgba(0,0,0,0.10)"/>
          <rect x="1" y="35" width="24" height="1.5" fill="rgba(0,0,0,0.10)"/>
          <!-- Rear compactor panel -->
          <rect x="1" y="42.5" width="24" height="6.5" rx="1.5" fill="#047857"/>
          <rect x="5" y="44" width="16" height="3.5" rx="1" fill="rgba(0,0,0,0.18)"/>
          <rect x="8" y="44.5" width="4" height="2.5" rx="0.5" fill="rgba(255,255,255,0.12)"/>
          <rect x="14" y="44.5" width="4" height="2.5" rx="0.5" fill="rgba(255,255,255,0.12)"/>
          <!-- Front axle wheels -->
          <rect x="-1" y="6" width="4" height="9" rx="2" fill="#0f172a"/>
          <rect x="-0.5" y="7" width="3" height="7" rx="1.5" fill="#1e293b"/>
          <rect x="23" y="6" width="4" height="9" rx="2" fill="#0f172a"/>
          <rect x="23.5" y="7" width="3" height="7" rx="1.5" fill="#1e293b"/>
          <!-- Rear dual-axle left -->
          <rect x="-1" y="21" width="4" height="8" rx="2" fill="#0f172a"/>
          <rect x="-0.5" y="22" width="3" height="6" rx="1.5" fill="#1e293b"/>
          <rect x="-1" y="31.5" width="4" height="8" rx="2" fill="#0f172a"/>
          <rect x="-0.5" y="32.5" width="3" height="6" rx="1.5" fill="#1e293b"/>
          <!-- Rear dual-axle right -->
          <rect x="23" y="21" width="4" height="8" rx="2" fill="#0f172a"/>
          <rect x="23.5" y="22" width="3" height="6" rx="1.5" fill="#1e293b"/>
          <rect x="23" y="31.5" width="4" height="8" rx="2" fill="#0f172a"/>
          <rect x="23.5" y="32.5" width="3" height="6" rx="1.5" fill="#1e293b"/>
        </svg>
      </div>`;

    const truckIcon = L.divIcon({ className: '', html: truckHtml, iconSize: [56, 56], iconAnchor: [28, 28] });

    // ── Animate along the ALREADY-DRAWN route polyline ───────────────────────
    // Compute distance-proportional frame count (70 frames/km, min 250)
    const totalKm = this.realRouteCoords.reduce(
      (acc, c, i) => i > 0 ? acc + this.dist(this.realRouteCoords[i - 1], c) : 0, 0);
    const FRAMES = Math.max(250, Math.round(totalKm * 70));
    const path = this.resamplePath(this.realRouteCoords, FRAMES);

    // Nearest frame index for each stop → enforce strict order
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
      if (stopIndices[k] >= FRAMES) stopIndices[k] = FRAMES - 1;
    }

    this.map.panTo(path[0], { animate: true, duration: 0.8 });
    this.truckMarker = L.marker(path[0], { icon: truckIcon, zIndexOffset: 2000 }).addTo(this.map);

    let si = 0;
    for (let i = 0; i < FRAMES; i++) {
      if (!this.navigationActive) break;

      this.truckMarker.setLatLng(path[i]);

      // Rotate to face direction of travel
      if (i > 0) {
        const deg = this.bearing(path[i - 1], path[i]);
        const el  = this.truckMarker.getElement();
        const wrap = el?.querySelector('.truck-marker-wrap') as HTMLElement | null;
        if (wrap) wrap.style.transform = `rotate(${deg}deg)`;
      }

      // Pan map when truck nears viewport edge (25% threshold)
      if (i % 20 === 0) {
        const b = this.map.getBounds();
        const [lat, lng] = path[i];
        const latR = b.getNorth() - b.getSouth();
        const lngR = b.getEast()  - b.getWest();
        const p = 0.22;
        if (lat < b.getSouth() + latR * p || lat > b.getNorth() - latR * p ||
            lng < b.getWest()  + lngR * p || lng > b.getEast()  - lngR * p) {
          this.map.panTo(path[i], { animate: true, duration: 0.45, easeLinearity: 1 });
        }
      }

      // Collect all stops whose frame index we've reached
      while (si < route.length && i >= stopIndices[si]) {
        this.currentStop      = si + 1;
        this.currentTruckLoad += route[si].estimatedLoad;
        if (this.routeMarkers[si]) {
          this.routeMarkers[si].setIcon(L.divIcon({
            className: 'route-stop-marker-completed',
            html: `<div class="stop-number">✓</div>`,
            iconSize: [32, 32], iconAnchor: [16, 16]
          }));
        }
        const bin = this.allBins.find(b => b.id === route[si].id);
        if (bin) { bin.fillPercentage = Math.random() * 6 + 2; this.renderBins(this.filtered()); }
        const stopId = route[si].id;
        si++;
        // Fire-and-forget API — don't block the animation loop
        this.http.put(
          `${this.API_URL}/containers/${stopId}/empty`, {},
          token ? { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) } : {}
        ).toPromise().catch(() => {});
      }

      await new Promise(r => setTimeout(r, 22));
    }

    const load = this.currentTruckLoad;
    this.navigationActive = false;
    alert(`Маршрут завършен!\nСпирки: ${route.length}\nСъбран товар: ${load.toFixed(0)} л`);
    this.currentTruckLoad = 0;
  }

  // Resample a polyline to `count` equally-spaced points (constant visual speed).
  private resamplePath(coords: [number, number][], count: number): [number, number][] {
    if (coords.length < 2) return coords;
    const cum = [0];
    for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + this.dist(coords[i - 1], coords[i]));
    const total = cum[cum.length - 1];
    if (total === 0) return coords;
    const out: [number, number][] = [];
    for (let k = 0; k < count; k++) {
      const d = (k / (count - 1)) * total;
      let lo = 0, hi = cum.length - 1;
      while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid; }
      const t = (cum[hi] - cum[lo]) > 0 ? (d - cum[lo]) / (cum[hi] - cum[lo]) : 0;
      const [la, ln] = coords[lo], [lb, ln2] = coords[hi];
      out.push([la + (lb - la) * t, ln + (ln2 - ln) * t]);
    }
    return out;
  }

  // Compass bearing (degrees clockwise from North) between two [lat, lon] points.
  private bearing(a: [number, number], b: [number, number]): number {
    const [la, lo] = a.map(x => x * Math.PI / 180);
    const [lb, lo2] = b.map(x => x * Math.PI / 180);
    const y = Math.sin(lo2 - lo) * Math.cos(lb);
    const x = Math.cos(la) * Math.sin(lb) - Math.sin(la) * Math.cos(lb) * Math.cos(lo2 - lo);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  // Interpolate sparse coords so animation always has ≥ stepsPerSegment frames per leg
  private interpolateCoords(coords: [number, number][], steps = 50): [number, number][] {
    if (coords.length < 2) return coords;
    const out: [number, number][] = [];
    for (let i = 0; i < coords.length - 1; i++) {
      const [la, lo] = coords[i], [lb, lb2] = coords[i + 1];
      for (let t = 0; t < steps; t++) {
        const r = t / steps;
        out.push([la + (lb - la) * r, lo + (lb2 - lo) * r]);
      }
    }
    out.push(coords[coords.length - 1]);
    return out;
  }

  private dist(a: [number, number], b: [number, number]): number {
    const R = 6371, dLat = (b[0] - a[0]) * Math.PI / 180, dLon = (b[1] - a[1]) * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  toggleReportPanel(show: boolean) {
    this.showReportPanel = show;
    setTimeout(() => this.map?.invalidateSize(), 350);
  }

  toggleRoutePanel(show: boolean) {
    this.showRoutePanel = show;
    setTimeout(() => this.map?.invalidateSize(), 350);
  }

  stopRoute() {
    this.navigationActive = false; this.clearRoute();
    this.routeResult = null; this.routeActive = false;
    this.currentStop = 0; this.currentTruckLoad = 0;
    this.selectedAreaId = ''; this.selectedTrashType = 0;
  }

  private clearRoute() {
    if (this.routeLine)    { this.map.removeLayer(this.routeLine);    this.routeLine    = undefined; }
    if (this.truckMarker)  { this.map.removeLayer(this.truckMarker);  this.truckMarker  = undefined; }
    this.routeMarkers.forEach(m => this.map.removeLayer(m));
    this.routeMarkers = []; this.realRouteCoords = [];
    this.clearSearch();
  }

  // ── Render ───────────────────────────────────────────────────────────────
  private renderBins(bins: Bin[]) {
    this.cluster.clearLayers();
    bins.forEach(bin => {
      const m = L.marker([bin.locationY, bin.locationX], { icon: this.createBinIcon(bin), binId: bin.id } as any);
      m.bindPopup(this.createPopup(bin), { maxWidth: 280, className: 'bpp-container' });
      if (this.isUser || this.isDriver) {
        m.on('click', () => {
          this.selectedBinForReport = bin;
          const el = document.getElementById('selected-bin-id') as HTMLInputElement;
          if (el) el.value = `Контейнер #${bin.id}`;
        });
      }
      this.cluster.addLayer(m);
    });
  }

  // ── Icon factory ─────────────────────────────────────────────────────────
  private createBinIcon(bin: Bin): L.DivIcon {
    const f      = Math.round(bin.fillPercentage);
    const temp   = bin.temperature ?? 0;
    const isFire = bin.status === 1 || temp > 55;
    const isWarm = temp > 44 && !isFire;

    // Ring / glow colour
    const ring = f >= 85 ? '#ef4444' : f >= 65 ? '#f97316' : f >= 45 ? '#f59e0b' : '#10b981';
    const glow = f >= 85 ? 'rgba(239,68,68,0.65)'
               : f >= 65 ? 'rgba(249,115,22,0.55)'
               : f >= 45 ? 'rgba(245,158,11,0.50)'
               :            'rgba(16,185,129,0.45)';

    // Flames: 3 for fire, 1 for warm
    const flameCount = isFire ? 3 : isWarm ? 1 : 0;
    const flames     = Array.from({ length: flameCount }, (_, i) => `
      <img src="${this.fireIcon}"
           class="bm-flame bm-flame-${i + 1}${isFire ? ' bm-fire' : ' bm-warm'}"
           alt="fire" draggable="false" />`
    ).join('');

    // Sensor using the real sensor-dot.svg
    const sensor = bin.hasSensor
      ? `<img src="${this.sensorIcon}" class="bm-sensor" alt="sensor" draggable="false" />`
      : '';

    // Temperature badge
    const tbadge = bin.hasSensor && bin.temperature !== null
      ? `<div class="bm-tbadge${isFire ? ' tbadge-fire' : isWarm ? ' tbadge-warm' : ''}">${Math.round(bin.temperature!)}°C</div>`
      : '';

    return L.divIcon({
      className: 'bm-host',
      html: `
        <div class="bm${f >= 85 ? ' bm-critical' : ''}${isFire ? ' bm-on-fire' : ''}">
          ${flames}
          <div class="bm-ring" style="
            background: conic-gradient(${ring} 0% ${f}%, rgba(255,255,255,0.07) ${f}% 100%);
            filter: drop-shadow(0 0 8px ${glow});">
            <div class="bm-inner">
              <img src="${this.binIcon(bin.trashType)}"
                   class="bm-binimg" alt="bin" draggable="false" />
            </div>
          </div>
          ${sensor}
          ${tbadge}
          <div class="bm-id">#${bin.id}</div>
        </div>`,
      iconSize:   [54, 70],
      iconAnchor: [27, 62]
    });
  }

  // ── Popup ─────────────────────────────────────────────────────────────────
  private createPopup(bin: Bin): string {
    const f      = bin.fillPercentage;
    const temp   = bin.temperature;
    const isFire = bin.status === 1 || (temp !== null && temp! > 55);
    const isWarm = temp !== null && temp! > 44 && !isFire;
    const ring   = f >= 85 ? '#ef4444' : f >= 65 ? '#f97316' : f >= 45 ? '#f59e0b' : '#10b981';
    const typeLbl  = ['Смесен', 'Пластмаса', 'Хартия', 'Стъкло'][bin.trashType] ?? '';
    const typeBg   = ['rgba(148,163,184,.18)', 'rgba(245,158,11,.18)', 'rgba(59,130,246,.18)', 'rgba(34,211,238,.18)'][bin.trashType];
    const typeClr  = ['#94a3b8', '#f59e0b', '#60a5fa', '#22d3ee'][bin.trashType];

    // Temp section
    const tempHtml = bin.hasSensor && temp !== null ? `
      <div class="bpp-temp ${isFire ? 'bpp-temp--fire' : isWarm ? 'bpp-temp--warm' : ''}">
        <div class="bpp-temp-left">
          <img src="${this.fireIcon}" class="bpp-fire-icon${isFire || isWarm ? '' : ' bpp-fire-icon--hidden'}" alt="fire" />
          <div>
            <div class="bpp-temp-lbl">Температура</div>
            <div class="bpp-temp-val" style="color:${isFire ? '#ef4444' : isWarm ? '#f97316' : '#94a3b8'}">
              ${Math.round(temp!)}°C
            </div>
          </div>
        </div>
        ${isFire
          ? `<div class="bpp-warn bpp-warn--fire">⚠ Риск от пожар!</div>`
          : isWarm
          ? `<div class="bpp-warn bpp-warn--warm">Повишена темп.</div>`
          : ''}
      </div>` : '';

    return `
      <div class="bpp">

        <div class="bpp-head">
          <div class="bpp-head-left">
            <img src="${this.binIcon(bin.trashType)}" width="22" height="22" alt="bin" />
            <span class="bpp-title">Контейнер #${bin.id}</span>
          </div>
          <span class="bpp-badge" style="background:${typeBg};color:${typeClr}">${typeLbl}</span>
        </div>

        <div class="bpp-fill">
          <div class="bpp-fill-row">
            <span class="bpp-lbl">Запълване</span>
            <span class="bpp-fill-pct" style="color:${ring}">${f.toFixed(0)}%</span>
          </div>
          <div class="bpp-track">
            <div class="bpp-bar" style="width:${f}%;background:${ring};box-shadow:0 0 10px ${ring}77"></div>
          </div>
        </div>

        ${tempHtml}

        <div class="bpp-rows">
          <div class="bpp-row">
            <img src="${this.sensorIcon}" width="16" height="16" alt="sensor" />
            <span>Сензор</span>
            <span style="color:${bin.hasSensor ? '#22d3ee' : '#475569'};font-weight:700">
              ${bin.hasSensor ? 'Активен' : 'Няма'}
            </span>
          </div>
          <div class="bpp-row">
            <span>📍</span><span>Зона</span>
            <span style="color:#cbd5e1;font-weight:600;font-size:11px">${bin.areaId}</span>
          </div>
        </div>

      </div>`;
  }

  // ── Filter control ────────────────────────────────────────────────────────
  private initFilterControl() {
    const self = this;
    const FC = (L.Control as any).extend({
      options: { position: 'topleft' },
      onAdd() {
        const el = L.DomUtil.create('div', 'map-filter-control');
        L.DomEvent.disableClickPropagation(el);
        el.innerHTML = `
          <div class="fc-wrap">

            <!-- ① Search hero -->
            <div class="fc-search">
              <svg class="fc-search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input id="bin-search-input" type="text"
                     placeholder="Адрес или #62…"
                     class="fc-search-inp"/>
              <button id="bin-search-btn" class="fc-search-go" title="Търси">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </button>
            </div>

            <div class="fc-sep"></div>

            <!-- ② Filter header + Reset -->
            <div class="fc-hdr">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
              </svg>
              <span>Филтри</span>
              <button id="fc-reset" class="fc-reset-btn" style="display:none">↺ Изчисти</button>
            </div>

            <!-- ③ Zone -->
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

            <!-- ④ Trash type -->
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

            <!-- ⑤ Fill level -->
            <div class="fc-block fc-block--last">
              <div class="fc-blk-lbl">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="20" x2="18" y2="10"/>
                  <line x1="12" y1="20" x2="12" y2="4"/>
                  <line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
                <span>Запълване</span>
              </div>
              <div class="fc-pills fc-pills--fill">
                <button class="fc-pill fc-pill--all active" data-fill="all">Всички</button>
                <button class="fc-pill fc-pill--flow" data-fill="low">
                  <span class="fc-fillbar" style="--fc-fill-w:28%;--fc-fill-c:#10b981"></span>&lt;40%
                </button>
                <button class="fc-pill fc-pill--fmed" data-fill="medium">
                  <span class="fc-fillbar" style="--fc-fill-w:55%;--fc-fill-c:#f59e0b"></span>40–70%
                </button>
                <button class="fc-pill fc-pill--fhi" data-fill="high">
                  <span class="fc-fillbar" style="--fc-fill-w:86%;--fc-fill-c:#ef4444"></span>&gt;70%
                </button>
              </div>
            </div>

          </div>`;

        self.filterEl = el;

        setTimeout(() => {
          const resetBtn = el.querySelector('#fc-reset') as HTMLElement | null;

          // Show/hide reset button based on active filters
          const checkReset = () => {
            if (!resetBtn) return;
            const hasFilter = self.activeFilter.type !== 'all'
              || self.activeFilter.fill !== 'all'
              || self.activeFilter.zone !== 'all';
            resetBtn.style.display = hasFilter ? '' : 'none';
          };

          // Reset all filters
          const doReset = () => {
            self.activeFilter = { type: 'all', fill: 'all', zone: 'all' };
            el.querySelectorAll('[data-type]').forEach(x =>
              x.classList.toggle('active', x.getAttribute('data-type') === 'all'));
            el.querySelectorAll('[data-fill]').forEach(x =>
              x.classList.toggle('active', x.getAttribute('data-fill') === 'all'));
            const zSel = el.querySelector('#zone-filter') as HTMLSelectElement | null;
            if (zSel) zSel.value = 'all';
            if (resetBtn) resetBtn.style.display = 'none';
            self.renderBins(self.filtered());
          };

          resetBtn?.addEventListener('click', doReset);

          // Zone select
          const zoneSelect = el.querySelector('#zone-filter') as HTMLSelectElement;
          zoneSelect?.addEventListener('change', e => {
            self.activeFilter.zone = (e.target as HTMLSelectElement).value;
            self.renderBins(self.filtered());
            checkReset();
          });

          // Type pills
          el.querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', e => {
            const v = (e.currentTarget as HTMLElement).getAttribute('data-type')!;
            self.activeFilter.type = v;
            el.querySelectorAll('[data-type]').forEach(x => x.classList.remove('active'));
            (e.currentTarget as HTMLElement).classList.add('active');
            self.renderBins(self.filtered());
            checkReset();
          }));

          // Fill pills
          el.querySelectorAll('[data-fill]').forEach(b => b.addEventListener('click', e => {
            const v = (e.currentTarget as HTMLElement).getAttribute('data-fill')!;
            self.activeFilter.fill = v;
            el.querySelectorAll('[data-fill]').forEach(x => x.classList.remove('active'));
            (e.currentTarget as HTMLElement).classList.add('active');
            self.renderBins(self.filtered());
            checkReset();
          }));

          // Address / bin search
          const searchInput = el.querySelector('#bin-search-input') as HTMLInputElement;
          const searchBtn   = el.querySelector('#bin-search-btn')   as HTMLButtonElement;
          const doSearch    = () => self.searchNearestBin(searchInput.value);
          searchBtn?.addEventListener('click', doSearch);
          searchInput?.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') doSearch(); });
        }, 120);

        return el;
      }
    });
    new FC().addTo(this.map);
  }

  // Populate the zone <select> once bins are loaded
  private populateZoneFilter(bins: Bin[]) {
    if (!this.filterEl) return;
    const select = this.filterEl.querySelector('#zone-filter') as HTMLSelectElement;
    if (!select) return;
    const zones = [...new Set(bins.map(b => b.areaId))].sort();
    select.innerHTML = '<option value="all">Всички зони</option>';
    zones.forEach(z => {
      const opt = document.createElement('option');
      opt.value = z; opt.textContent = z;
      select.appendChild(opt);
    });
  }

  // Geocode address → show pin + radius ring + highlight nearby bins with circles.
  // #N shortcut → jump directly to bin N (no circles).
  async searchNearestBin(query: string) {
    if (!query.trim()) return;
    const q = query.trim();
    this.clearSearch();

    // ── Direct bin-ID shortcut: #62 ──────────────────────────────────────
    if (/^#\d+$/.test(q)) {
      const bin = this.allBins.find(b => b.id === parseInt(q.slice(1), 10));
      if (bin) { this.highlightBin(bin); return; }
      alert(`Контейнер ${q} не е намерен`); return;
    }

    // ── Address geocoding (Nominatim, Sofia context) ──────────────────────
    let lat: number, lon: number;
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ', София, България')}&format=json&limit=1&accept-language=bg`;
      const res = await (await fetch(url)).json();
      if (!res?.length) { alert('Адресът не е намерен'); return; }
      lat = parseFloat(res[0].lat);
      lon = parseFloat(res[0].lon);
    } catch { alert('Грешка при геокодиране'); return; }

    // Pin at geocoded address
    this.searchMarker = L.marker([lat, lon], {
      icon: L.divIcon({
        className: '',
        html: `<div class="search-pin">
                 <div class="search-pin-ring"></div>
                 <div class="search-pin-ring search-pin-ring--2"></div>
                 <div class="search-pin-dot"></div>
               </div>`,
        iconSize: [40, 40], iconAnchor: [20, 20]
      }),
      zIndexOffset: 1500
    }).addTo(this.map);

    // Dashed radius circle (500 m)
    const RADIUS_M = 500;
    const radiusCircle = L.circle([lat, lon], {
      radius: RADIUS_M,
      color: '#3b82f6', weight: 1.5, opacity: 0.55,
      fill: true, fillColor: '#3b82f6', fillOpacity: 0.04,
      dashArray: '8 5'
    } as any).addTo(this.map);
    this.searchCircles.push(radiusCircle);

    // Highlight every bin inside the radius
    const nearby: Bin[] = [];
    this.allBins.forEach(bin => {
      const dm = this.dist([lat, lon], [bin.locationY, bin.locationX]) * 1000; // km → m
      if (dm <= RADIUS_M) {
        nearby.push(bin);
        const c = L.circle([bin.locationY, bin.locationX], {
          radius: 22,
          color: '#f59e0b', weight: 2.5, opacity: 0.9,
          fill: true, fillColor: '#f59e0b', fillOpacity: 0.18,
          className: 'bin-nearby-circle'
        } as any).addTo(this.map);
        c.on('click', () => {
          this.selectedBinForReport = bin;
          const el = document.getElementById('selected-bin-id') as HTMLInputElement;
          if (el) el.value = `Контейнер #${bin.id}`;
        });
        this.searchCircles.push(c);
      }
    });

    // Fly to address, fit to show entire radius
    this.map.flyToBounds(
      L.latLngBounds([[lat - 0.006, lon - 0.008], [lat + 0.006, lon + 0.008]]),
      { animate: true, duration: 0.9 }
    );

    // If there's exactly 1 nearby bin, auto-open its popup
    if (nearby.length === 1) setTimeout(() => this.highlightBin(nearby[0]), 1100);
  }

  private clearSearch() {
    if (this.searchMarker) { this.map.removeLayer(this.searchMarker); this.searchMarker = undefined; }
    this.searchCircles.forEach(c => this.map.removeLayer(c));
    this.searchCircles = [];
  }

  private highlightBin(bin: Bin) {
    this.map.setView([bin.locationY, bin.locationX], 17, { animate: true, duration: 0.7 });
    setTimeout(() => {
      let found: any = null;
      this.cluster.eachLayer((layer: any) => { if (layer.options?.binId === bin.id) found = layer; });
      if (found) this.cluster.zoomToShowLayer(found, () => found.openPopup());
    }, 850);
  }

  // ── Report ────────────────────────────────────────────────────────────────
  handleImagePreview(event: any) {
    const file = event.target.files?.[0]; if (!file) return;
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/gif'].includes(file.type)) { alert('Само JPEG/PNG/GIF'); return; }
    if (file.size > 5 * 1024 * 1024) { alert('Максимум 5MB'); return; }
    const r = new FileReader();
    r.onload = (e: any) => { this.reportImagePreview = e.target.result; };
    r.readAsDataURL(file);
  }

  clearImagePreview() {
    this.reportImagePreview = null;
    const el = document.getElementById('report-image') as HTMLInputElement;
    if (el) el.value = '';
  }

  submitReport() {
    if (!this.currentUser) { alert('Влезте в системата'); this.router.navigate(['/login']); return; }
    if (!this.selectedBinForReport) { alert('Изберете контейнер'); return; }
    const ts   = document.getElementById('report-type')        as HTMLSelectElement;
    const img  = document.getElementById('report-image')       as HTMLInputElement;
    const desc = document.getElementById('report-description') as HTMLTextAreaElement;
    const tm: Record<string, number> = { Full: 0, Fire: 1, SensorBroken: 2, TruckProblem: 3, ContainerDamage: 4 };
    const fd = new FormData();
    fd.append('TrashContainerId', this.selectedBinForReport.id.toString());
    fd.append('ReportType', (tm[ts.value] ?? 0).toString());
    if (desc?.value)       fd.append('Description', desc.value);
    if (img?.files?.[0])   fd.append('Photo', img.files[0]);
    const token = this.getToken();
    if (!token) { alert('Сесията ви е изтекла'); this.router.navigate(['/login']); return; }
    this.http.post(`${this.API_URL}/reports`, fd, { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) })
      .subscribe({
        next: () => {
          alert('Докладването е изпратено!');
          this.selectedBinForReport = null; this.reportImagePreview = null; this.reportDescription = '';
          const si = document.getElementById('selected-bin-id') as HTMLInputElement;
          if (si) si.value = ''; if (img) img.value = ''; if (desc) desc.value = '';
        },
        error: e => {
          if (e.status === 401) { alert('Сесията изтекла'); this.router.navigate(['/login']); }
          else alert('Грешка при изпращане');
        }
      });
  }

  private getToken(): string | null {
    return this.authService.getToken();
  }
}