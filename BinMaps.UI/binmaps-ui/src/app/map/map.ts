import { Component, AfterViewInit, ViewEncapsulation, inject, OnInit, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AuthService, AuthUser } from '../services/auth.service';
import * as L from 'leaflet';
import 'leaflet.markercluster';
import { ContainerSignalRService } from '../services/signalr.service';

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

  private readonly API_URL   = 'https://localhost:7277/api';
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
  private activeFilter       = { type: 'all', fill: 'all' };
  private routeLine?:          L.Polyline;
  private routeMarkers:        L.Marker[] = [];
  private truckMarker?:        L.Marker;
  private selectedBinForReport: Bin | null = null;
  private destroy$           = new Subject<void>();
  private realRouteCoords:     [number, number][] = [];

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

  // asset paths
  private binIcon(type: number) { return `${this.ICONS_DIR}/bin-${['mixed','plastic','paper','glass'][type] ?? 'mixed'}.svg`; }
  private get fireIcon()   { return `${this.ICONS_DIR}/bin-fire.svg`; }
  private get sensorIcon() { return `${this.ICONS_DIR}/sensor-dot.svg`; }
  private get truckSvg()   { return `${this.ICONS_DIR}/truck.svg`; }

  // ── Lifecycle ────────────────────────────────────────────────────────────
  ngOnInit() {
    this.authService.currentUser$.pipe(takeUntil(this.destroy$)).subscribe(u => {
      this.currentUser = u; this.syncRole();
    });
    this.signalR.start();
    // FIX: full re-render on every SignalR batch so clustered markers update correctly
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

  // ── Map ──────────────────────────────────────────────────────────────────
  private initMap() {
    this.map = L.map('map', {
      center: [42.6977, 23.3219], zoom: 12, minZoom: 11, maxZoom: 18,
      maxBounds: [[42.55, 23.15], [42.85, 23.50]], maxBoundsViscosity: 0.8
    });
    this.baseLayers['standard']  = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { className: 'map-tiles' });
    this.baseLayers['dark']      = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png');
    this.baseLayers['terrain']   = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png');
    this.baseLayers['satellite'] = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
    const saved = localStorage.getItem('mapStyle') || 'standard';
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
      next: bins => { this.allBins = bins; this.renderBins(bins); },
      error: e => console.error(e)
    });
  }

  private filtered(): Bin[] {
    let b = this.allBins;
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
      m.bindPopup(`<div class="route-popup"><strong>Спирка ${s.stopNumber}</strong><p>#${s.id} · ${s.fillPercentage.toFixed(0)}%</p><p>${s.estimatedLoad.toFixed(1)} л · ${s.distanceFromPrevious.toFixed(2)} км</p></div>`);
      this.routeMarkers.push(m);
    });
    this.map.fitBounds(L.latLngBounds(route.map(s => [s.locationY, s.locationX] as [number, number])));
  }

  async startNavigation() {
    if (!this.routeResult?.route.length || !this.realRouteCoords.length) { alert('Маршрутът не е готов'); return; }
    this.navigationActive = true; this.currentStop = 0; this.currentTruckLoad = 0;

    // Use the real truck.svg asset
    const truckIcon = L.divIcon({
      className: 'truck-marker-active',
      html: `<div class="truck-icon-wrap"><img src="${this.truckSvg}" width="40" height="40" /></div>`,
      iconSize: [52, 52], iconAnchor: [26, 26]
    });

    const route = this.routeResult.route;
    this.truckMarker = L.marker(this.realRouteCoords[0], { icon: truckIcon }).addTo(this.map);
    let si = 0;

    for (let i = 0; i < this.realRouteCoords.length; i++) {
      if (!this.navigationActive) break;
      const coord = this.realRouteCoords[i];
      this.truckMarker.setLatLng(coord);
      if (i % 8 === 0) this.map.panTo(coord, { animate: true, duration: 0.25, easeLinearity: 0.1 });

      while (si < route.length && this.dist(coord, [route[si].locationY, route[si].locationX]) < 0.08) {
        this.currentStop      = si + 1;
        this.currentTruckLoad += route[si].estimatedLoad;
        if (this.routeMarkers[si]) this.routeMarkers[si].setIcon(L.divIcon({
          className: 'route-stop-marker-completed',
          html: `<div class="stop-number">✓</div>`,
          iconSize: [32, 32], iconAnchor: [16, 16]
        }));
        try {
          await this.http.put(`${this.API_URL}/containers/${route[si].id}/empty`, {}).toPromise();
          const bin = this.allBins.find(b => b.id === route[si].id);
          if (bin) { bin.fillPercentage = Math.random() * 6 + 2; this.renderBins(this.filtered()); }
        } catch {}
        si++;
        await new Promise(r => setTimeout(r, 500));
      }
      await new Promise(r => setTimeout(r, 40));
    }

    const load = this.currentTruckLoad;
    this.navigationActive = false;
    alert(`Маршрут завършен!\nСпирки: ${route.length}\nСъбран товар: ${load.toFixed(0)} л`);
    this.currentTruckLoad = 0;
  }

  private dist(a: [number, number], b: [number, number]): number {
    const R = 6371, dLat = (b[0] - a[0]) * Math.PI / 180, dLon = (b[1] - a[1]) * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
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
          <div class="filter-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            <span>Филтри</span>
          </div>
          <div class="filter-section">
            <label class="filter-label">Тип отпадък</label>
            <div class="filter-options">
              <button class="filter-btn active" data-type="all">Всички</button>
              <button class="filter-btn" data-type="1">Пластмаса</button>
              <button class="filter-btn" data-type="2">Хартия</button>
              <button class="filter-btn" data-type="3">Стъкло</button>
              <button class="filter-btn" data-type="0">Смесен</button>
            </div>
          </div>
          <div class="filter-section">
            <label class="filter-label">Запълване</label>
            <div class="filter-options">
              <button class="filter-btn active" data-fill="all">Всички</button>
              <button class="filter-btn" data-fill="low">&lt;40%</button>
              <button class="filter-btn" data-fill="medium">40–70%</button>
              <button class="filter-btn" data-fill="high">&gt;70%</button>
            </div>
          </div>`;
        setTimeout(() => {
          el.querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', e => {
            const v = (e.currentTarget as HTMLElement).getAttribute('data-type')!;
            self.activeFilter.type = v;
            el.querySelectorAll('[data-type]').forEach(x => x.classList.remove('active'));
            (e.currentTarget as HTMLElement).classList.add('active');
            self.renderBins(self.filtered());
          }));
          el.querySelectorAll('[data-fill]').forEach(b => b.addEventListener('click', e => {
            const v = (e.currentTarget as HTMLElement).getAttribute('data-fill')!;
            self.activeFilter.fill = v;
            el.querySelectorAll('[data-fill]').forEach(x => x.classList.remove('active'));
            (e.currentTarget as HTMLElement).classList.add('active');
            self.renderBins(self.filtered());
          }));
        }, 100);
        return el;
      }
    });
    new FC().addTo(this.map);
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
    return localStorage.getItem('token') || (JSON.parse(localStorage.getItem('user') || '{}').token ?? null);
  }
}