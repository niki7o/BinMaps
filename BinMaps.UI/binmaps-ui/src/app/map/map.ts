import { Component, AfterViewInit, ViewEncapsulation, inject, OnInit, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, timeout, firstValueFrom } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { AuthUser } from '../services/auth.models';
import { ContainerSignalRService } from '../services/signalr.service';
import { ConfirmService } from '../shared/confirm-dialog/confirm.service';
import { ToastService } from '../shared/toast/toast.service';
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
  isSeeded?: boolean;
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

/** Sentinel thrown by openRouteRun() when the server returns 409 — the
 *  navigation flow catches it and aborts cleanly. Distinct error class so
 *  generic catches don't swallow it as "unknown HTTP error". */
class RouteLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RouteLockedError';
  }
}

/** "преди 12 минути" / "току-що". Bulgarian phrasing matches the rest of
 *  the user-facing strings in this app. */
function humanAgo(when: Date): string {
  const ms = Date.now() - when.getTime();
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 30) return 'току-що';
  if (sec < 60) return `преди ${sec} сек.`;
  const min = Math.round(sec / 60);
  if (min < 60) return `преди ${min} мин.`;
  const hr  = Math.round(min / 60);
  return `преди ${hr} ч.`;
}

/**
 * Deterministic colour from a driverId — same driver always gets the
 * same colour so trucks don't flicker as updates arrive, and we don't
 * need to maintain a global palette / counter. Mirrors the function in
 * live-driver-tracking.service.ts so the two views agree on colour.
 */
function colorForDriverId(driverId: string): string {
  const palette = [
    '#10b981', '#3b82f6', '#06b6d4', '#f59e0b',
    '#ef4444', '#a855f7', '#ec4899', '#14b8a6',
    '#f97316', '#84cc16', '#6366f1', '#fbbf24',
  ];
  let hash = 0;
  for (let i = 0; i < driverId.length; i++) {
    hash = (hash * 31 + driverId.charCodeAt(i)) | 0;
  }
  return palette[Math.abs(hash) % palette.length];
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

  private readonly API_URL = environment.apiUrl;
  private readonly ICONS_DIR = 'assets/icons';

  private map!: L.Map;
  private cluster!: any;
  private allBins: Bin[] = [];
  /** Map bin id -> Leaflet marker. Used for in-place updates so that
   *  clicking a bin doesn't close its popup on the next SignalR refresh. */
  private binMarkers: Map<number, L.Marker> = new Map();
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

  // Live view of other drivers that are currently on a route. Visible to
  // every authenticated role (admins, drivers, citizens) since the hub
  // broadcasts to all groups now.
  //  key: driverId, value: the Leaflet marker shown for that driver.
  private liveDriverMarkers: Map<string, L.Marker> = new Map();
  //  key: driverId, value: the full latest event (for panel info).
  liveDrivers = new Map<string, {
    name: string; areaId: string; lat: number; lng: number;
    stopIndex: number; totalStops: number; load: number; at: string;
    color: string;
  }>();
  showLiveDriversPanel = true;

  // RAF-driven smooth lerp between consecutive position updates. Each entry
  // tracks where the marker currently sits and where it's heading; the
  // animation loop interpolates between them so trucks glide instead of
  // jumping each tick. Tab-hidden ⇒ rAF is throttled to ~1Hz; on
  // visibilitychange we snap to the target so the catch-up isn't visible.
  private liveDriverAnim = new Map<string, {
    fromLat: number; fromLng: number;
    toLat:   number; toLng:   number;
    fromHeading: number; toHeading: number;
    startedAt: number;       // performance.now()
    durationMs: number;
  }>();
  private liveDriverAnimRAF: number | null = null;
  /** ~1.1× the broadcast interval (server pushes ~1 Hz). Slightly longer
   *  so the marker is still gliding when the next packet arrives, avoiding
   *  visible "stop-and-go" between updates. */
  private static readonly LIVE_DRIVER_LERP_MS = 1100;
  private liveDriverVisHandler?: () => void;

  // Current driver's telemetry state (for broadcasting).
  private driverRunId = 0;
  private driverLastBroadcastAt = 0;
  private driverLastLatLng: [number, number] | null = null;

  reportImagePreview:    string | null = null;
  selectedFile:          File | null = null;
  reportDescription = '';
  selectedReportType = 'Full';
  reportSubmitting = false;
  reportCheckingPhoto = false;   
  photoNoBinWarning = false;
  photoCheckingPreview = false;
  private photoAnalysisCache: { containerDetected: boolean; detectedClass: string; confidence: number } | null = null;

  navigationMode: 'auto' | 'step' = 'auto';  
  stepPending = false;                       
  private _stepResolve?: () => void;           

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

  private http = inject(HttpClient);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  private signalR = inject(ContainerSignalRService);
  private confirmSvc = inject(ConfirmService);
  private toast = inject(ToastService);

  currentUser: AuthUser | null = null;
  isAdmin = false;
  isDriver = false;
  isUser = false;
  isGuest = true;
  guestBannerVisible = true;
  selectedAreaId = '';
  selectedTrashType = 0;
  routeResult: RouteResult | null = null;
  routeActive = false;
  navigationActive = false;
  showReportPanel = true;
  showRoutePanel = true;
  currentStop = 0;
  currentTruckLoad = 0;

  private baseLayers: Record<string, L.TileLayer> = {};
  currentMapStyle = localStorage.getItem('mapStyle') || 'standard';
  mapStyles = [
    { key: 'standard',  label: 'Стандартна'  },
    { key: 'voyager',   label: 'Пътеводител' },
    { key: 'satellite', label: 'Сателит'     },
    { key: 'light',     label: 'Светла'      }
  ];

  // ── 3D view ──────────────────────────────────────────────────────────────
  show3DView = false;
  map3dFullscreen = false;
  private map3d: any = null;
  private map3dStyleLoaded = false;

  // Token comes from src/environments/environment.ts — never hardcode secrets.
  private readonly MAPBOX_TOKEN = environment.mapboxToken;

  /** Mapbox style URL per 2D style key */
  private readonly map3dStyles: Record<string, string> = {
    standard:  'mapbox://styles/nik1t0/cmnll3qxs000401qw6oph0qm3',
    voyager:   'mapbox://styles/mapbox/outdoors-v12',
    satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
    light:     'mapbox://styles/mapbox/light-v11'
  };

  // ── Speed control ─────────────────────────────────────────────────────────
  speedMultiplier = 1;
  readonly speedOptions = [1, 5, 10, 20, 50];


  private binIcon(type: number): string {
    return `${this.ICONS_DIR}/bin-${['mixed', 'plastic', 'paper', 'glass'][type] ?? 'mixed'}.svg`;
  }

  private get fireIcon()   { return `${this.ICONS_DIR}/bin-fire.svg`;           }
  private get burningIcon() { return `${this.ICONS_DIR}/bin-burning.svg`;        }
  private get brokenIcon() { return `${this.ICONS_DIR}/bin-broken.svg`;         }
  private get sensorBrokenIcon()  { return `${this.ICONS_DIR}/bin-sensor-broken.svg`;  }
  private get sensorIcon() { return `${this.ICONS_DIR}/sensor-dot.svg`;         }



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
        b.temperature = u.temperature ?? null;

        if (u.status   != null)    b.status = u.status;
        if (u.hasSensor != null)   b.hasSensor = u.hasSensor;
      });

      this.renderBins(this.filtered());
    });

    // Admin deleted a container somewhere (here or another tab) — drop the
    // marker from the map immediately so no-one keeps interacting with a
    // container that no longer exists.
    this.signalR.containerRemoved$
      .pipe(takeUntil(this.destroy$))
      .subscribe(id => this.removeBinLocally(id));

    this.signalR.containerAdded$
      .pipe(takeUntil(this.destroy$))
      .subscribe(payload => {
        if (!this.allBins.find(b => b.id === payload.id)) {
          this.allBins.push(payload as Bin);
          this.renderBins(this.filtered());
        }
      });

    // Every authenticated role (admin/driver/citizen) sees other drivers.
    // The hub now fans the `DriverPosition` event to admins + drivers +
    // users groups, so this single subscription works for everyone.
    this.signalR.driverPositions$
      .pipe(takeUntil(this.destroy$))
      .subscribe(ev => this.onDriverPosition(ev));

    // Snap-to-truth on tab return: rAF is throttled to ~1Hz when the tab
    // is hidden, so the lerp pauses. The SignalR connection is still alive
    // (or auto-reconnecting), so updates *do* arrive — but we want the
    // markers to land on the most recent position when the user comes back,
    // not finish a 1-second lerp from where they were 4 minutes ago.
    //
    // We also re-pull the snapshot to pick up any *new* runs that started
    // while the tab was hidden — those wouldn't be in our local map yet.
    this.liveDriverVisHandler = () => {
      if (document.visibilityState !== 'visible') return;
      this.snapAllLiveDriversToTarget();
      this.fetchActiveDriversSnapshot();
    };
    document.addEventListener('visibilitychange', this.liveDriverVisHandler);
  }

  private onDriverPosition(ev: {
    driverId: string; driverName: string; lat: number; lng: number;
    heading: number; stopIndex: number; totalStops: number; load: number;
    phase: string; areaId: string; at: string;
  }): void {
    if (!this.map) return;

    // Don't render *yourself* on the live overlay — drivers running their
    // own route already have their personal `truckMarker`. Avoids two
    // markers fighting at the same coordinates.
    if (this.currentUser && ev.driverId === this.currentUser.id) return;

    if (ev.phase === 'end') {
      const m = this.liveDriverMarkers.get(ev.driverId);
      if (m) { this.map.removeLayer(m); this.liveDriverMarkers.delete(ev.driverId); }
      this.liveDrivers.delete(ev.driverId);
      this.liveDriverAnim.delete(ev.driverId);
      return;
    }

    // Reuse a previously-assigned colour so the truck's icon doesn't
    // change palette mid-route.
    const previous = this.liveDrivers.get(ev.driverId);
    const color = previous?.color ?? colorForDriverId(ev.driverId);

    this.liveDrivers.set(ev.driverId, {
      name:       ev.driverName || 'Шофьор',
      areaId:     ev.areaId,
      lat:        ev.lat,
      lng:        ev.lng,
      stopIndex:  ev.stopIndex,
      totalStops: ev.totalStops,
      load:       ev.load,
      at:         ev.at,
      color,
    });

    let marker = this.liveDriverMarkers.get(ev.driverId);
    const target: L.LatLngExpression = [ev.lat, ev.lng];

    if (!marker) {
      // First sighting — drop the marker straight at the target.
      marker = L.marker(target, {
        icon: this.makeLiveDriverIcon(ev.driverName, ev.heading, color),
        zIndexOffset: 1800,
      }).addTo(this.map);
      marker.bindTooltip(
        `${ev.driverName || 'Шофьор'} · зона ${ev.areaId} · спирка ${ev.stopIndex}/${ev.totalStops}`,
        { direction: 'top', offset: [0, -22] }
      );
      this.liveDriverMarkers.set(ev.driverId, marker);
      // Initialise an anim entry sitting on the target so subsequent
      // updates have a "from" to lerp from.
      this.liveDriverAnim.set(ev.driverId, {
        fromLat: ev.lat, fromLng: ev.lng,
        toLat:   ev.lat, toLng:   ev.lng,
        fromHeading: ev.heading, toHeading: ev.heading,
        startedAt: performance.now(),
        durationMs: 0,
      });
    } else {
      // Subsequent update — kick off a lerp from the current rendered
      // position to the new target. Heading is interpolated on the
      // shortest-arc path so a turn from 350° → 10° goes the right way
      // around (not the long way around the compass).
      const here = marker.getLatLng();
      this.liveDriverAnim.set(ev.driverId, {
        fromLat: here.lat,    fromLng: here.lng,
        toLat:   ev.lat,      toLng:   ev.lng,
        fromHeading: previous?.lat !== undefined ? (this.liveDriverAnim.get(ev.driverId)?.toHeading ?? ev.heading) : ev.heading,
        toHeading: ev.heading,
        startedAt: performance.now(),
        durationMs: MapComponent.LIVE_DRIVER_LERP_MS,
      });
      marker.setTooltipContent(
        `${ev.driverName || 'Шофьор'} · зона ${ev.areaId} · спирка ${ev.stopIndex}/${ev.totalStops}`
      );
    }

    this.ensureLiveDriverAnimLoop();
  }

  /**
   * Single rAF loop that drives every live-driver marker. We don't
   * spawn one per driver — a single loop iterates the anim map and ticks
   * all of them, which keeps the cost flat as the fleet grows.
   */
  private ensureLiveDriverAnimLoop(): void {
    if (this.liveDriverAnimRAF !== null) return;
    const tick = () => {
      const now = performance.now();
      let anyActive = false;

      for (const [driverId, a] of this.liveDriverAnim.entries()) {
        const m = this.liveDriverMarkers.get(driverId);
        if (!m) continue;

        if (a.durationMs <= 0) continue;
        const t = Math.min(1, (now - a.startedAt) / a.durationMs);
        // Ease-out cubic — fast at first, settles into the new position.
        const eased = 1 - Math.pow(1 - t, 3);

        const lat = a.fromLat + (a.toLat - a.fromLat) * eased;
        const lng = a.fromLng + (a.toLng - a.fromLng) * eased;
        m.setLatLng([lat, lng]);

        // Heading: shortest-arc lerp.
        const diff = ((a.toHeading - a.fromHeading + 540) % 360) - 180;
        const heading = a.fromHeading + diff * eased;
        const driver = this.liveDrivers.get(driverId);
        if (driver) {
          m.setIcon(this.makeLiveDriverIcon(driver.name, heading, driver.color));
        }

        if (t < 1) anyActive = true;
      }

      this.liveDriverAnimRAF = anyActive ? requestAnimationFrame(tick) : null;
    };
    this.liveDriverAnimRAF = requestAnimationFrame(tick);
  }

  /**
   * Called on tab-visibility return. Cancels the current lerp and slams
   * every marker onto its target position so there's no visible
   * catch-up animation when the user comes back to the tab.
   */
  private snapAllLiveDriversToTarget(): void {
    for (const [driverId, a] of this.liveDriverAnim.entries()) {
      const m = this.liveDriverMarkers.get(driverId);
      if (!m) continue;
      m.setLatLng([a.toLat, a.toLng]);
      const driver = this.liveDrivers.get(driverId);
      if (driver) {
        m.setIcon(this.makeLiveDriverIcon(driver.name, a.toHeading, driver.color));
      }
      // Mark anim as completed so the rAF loop doesn't re-animate from here.
      a.fromLat = a.toLat;
      a.fromLng = a.toLng;
      a.fromHeading = a.toHeading;
      a.durationMs = 0;
    }
    if (this.liveDriverAnimRAF !== null) {
      cancelAnimationFrame(this.liveDriverAnimRAF);
      this.liveDriverAnimRAF = null;
    }
  }

  private makeLiveDriverIcon(name: string, heading: number, color: string): L.DivIcon {
    const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
    const deg = Number.isFinite(heading) ? Math.round(heading) : 0;
    return L.divIcon({
      className: '',
      iconSize: [44, 44],
      iconAnchor: [22, 22],
      html: `
        <div class="live-driver-marker" title="${name || 'Шофьор'}" style="--driver-color: ${color}">
          <div class="live-driver-pulse"></div>
          <div class="live-driver-body" style="transform: rotate(${deg}deg)">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2 L18 10 H14 V22 H10 V10 H6 Z" fill="${color}" stroke="#0f172a" stroke-width="1"/>
            </svg>
          </div>
          <div class="live-driver-label">${initial}</div>
        </div>`,
    });
  }

  centerOnLiveDriver(driverId: string): void {
    const d = this.liveDrivers.get(driverId);
    if (d && this.map) {
      this.map.setView([d.lat, d.lng], Math.max(this.map.getZoom(), 15), { animate: true });
    }
  }

  liveDriverList(): Array<{ id: string; name: string; stopIndex: number; totalStops: number; areaId: string; load: number; }> {
    return Array.from(this.liveDrivers.entries()).map(([id, d]) => ({
      id, name: d.name, stopIndex: d.stopIndex, totalStops: d.totalStops, areaId: d.areaId, load: d.load,
    }));
  }

  private removeBinLocally(id: number) {
    const before = this.allBins.length;
    this.allBins = this.allBins.filter(b => b.id !== id);
    const marker = this.binMarkers.get(id);
    if (marker) {
      this.map?.removeLayer(marker);
      this.binMarkers.delete(id);
    }
    if (this.allBins.length !== before) {
      this.renderBins(this.filtered());
    }
  }

  ngAfterViewInit() {
    this.initMap();
    this.loadBins();
    this.initFilterControl();

    // Catch up on already-running routes so trucks appear immediately
    // instead of waiting for the next ~1Hz broadcast. Deep-link from
    // admin "Активни (live)" cards passes ?focusDriver=<id>; once the
    // snapshot lands we centre the map on that driver and skip the
    // default zoom-to-bins behaviour.
    const focusDriverId = this.route.snapshot.queryParamMap.get('focusDriver');
    this.fetchActiveDriversSnapshot(focusDriverId);

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

  /**
   * Pulls the snapshot of currently-active route runs and feeds each
   * one through the same onDriverPosition() handler so live markers
   * appear without waiting for the next SignalR push. Called once on
   * mount and every time the tab returns to visible.
   *
   * If `focusDriverId` is provided (from a deep-link), the map is
   * centred on that driver as soon as their snapshot row lands.
   */
  private fetchActiveDriversSnapshot(focusDriverId?: string | null): void {
    const token = this.getToken();
    if (!token) return;
    this.http.get<Array<{
      runId: number; driverId: string; driverName: string;
      areaId: string; trashType: number; startedAt: string;
      lastPosition: {
        lat: number; lng: number; heading: number; speedKmh: number;
        stopIndex: number; totalStops: number; load: number;
        phase: 'start' | 'move' | 'stop' | 'end'; at: string;
      } | null;
    }>>(
      `${this.API_URL}/trucks/route/active`,
      { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) },
    ).pipe(takeUntil(this.destroy$))
     .subscribe({
       next: rows => {
         for (const r of rows ?? []) {
           if (!r.lastPosition) continue;
           // Synthesise the same shape onDriverPosition expects.
           this.onDriverPosition({
             driverId:   r.driverId,
             driverName: r.driverName,
             lat:        r.lastPosition.lat,
             lng:        r.lastPosition.lng,
             heading:    r.lastPosition.heading,
             stopIndex:  r.lastPosition.stopIndex,
             totalStops: r.lastPosition.totalStops,
             load:       r.lastPosition.load,
             phase:      r.lastPosition.phase,
             areaId:     r.areaId,
             at:         r.lastPosition.at,
           });
         }

         // Deep-link target — centre on the requested driver once they're
         // in our local state. Bail silently if the driver isn't actually
         // active (run finished between the click and the snapshot).
         if (focusDriverId && this.map) {
           const d = this.liveDrivers.get(focusDriverId);
           if (d) {
             this.map.setView([d.lat, d.lng],
               Math.max(this.map.getZoom(), 16),
               { animate: true });
           }
         }
       },
       error: () => { /* harmless — keep whatever state we already have */ },
     });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();

    // Notify admins that this driver's run ended if we were navigating.
    if (this.navigationActive && this.driverLastLatLng) {
      this.broadcastDriverPhase('end', this.driverLastLatLng);
    }
    this.navigationActive = false;

    for (const m of this.liveDriverMarkers.values()) {
      try { this.map?.removeLayer(m); } catch { /* map already torn down */ }
    }
    this.liveDriverMarkers.clear();
    this.liveDrivers.clear();
    this.liveDriverAnim.clear();
    if (this.liveDriverAnimRAF !== null) {
      cancelAnimationFrame(this.liveDriverAnimRAF);
      this.liveDriverAnimRAF = null;
    }
    if (this.liveDriverVisHandler) {
      document.removeEventListener('visibilitychange', this.liveDriverVisHandler);
      this.liveDriverVisHandler = undefined;
    }

    this.signalR.stop();
  }



  private syncRole() {
    if (!this.currentUser) {
      this.isGuest = true;
      this.isAdmin = false;
      this.isDriver = false;
      this.isUser = false;
      return;
    }

    this.isGuest = false;
    this.isAdmin = this.currentUser.role === 'Admin';
    this.isDriver = this.currentUser.role === 'Driver';
    this.isUser = this.currentUser.role === 'User';
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
      center: environment.region.center,
      zoom: 12,
      minZoom: 11,
      maxZoom: 18,
      maxBounds: [[42.55, 23.15], [42.85, 23.50]],
      maxBoundsViscosity: 0.8,
      // Bug fix: Shift+drag box-zoom creates a translucent selection rect and
      // can leave the map black after release — disable it entirely.
      boxZoom: false,
      // Bug fix: remove the default Leaflet attribution link at the bottom.
      attributionControl: false
    });

    this.baseLayers['standard']  = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { className: 'map-tiles' });
    this.baseLayers['voyager']   = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png');
    // Bug fix: maxNativeZoom:17 prevents "map data not yet available" on
    // ESRI's satellite layer when zoomed to 18 — tiles are stretched instead.
    this.baseLayers['satellite'] = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxNativeZoom: 17 }
    );
    this.baseLayers['light']     = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png');

    const saved = localStorage.getItem('mapStyle') || 'standard';
    this.currentMapStyle = saved;
    this.baseLayers[this.currentMapStyle].addTo(this.map);
    this.map.addLayer(this.cluster);

    // Wire admin delete button (rendered inside popup HTML) once, using
    // event delegation so we don't need to rebind on every popup open.
    this.map.on('popupopen', (e: any) => {
      const root: HTMLElement | undefined = e?.popup?.getElement?.();
      if (!root) return;
      const btn = root.querySelector<HTMLButtonElement>('.bpp-delete-btn');
      if (!btn || btn.dataset['wired'] === '1') return;
      btn.dataset['wired'] = '1';
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset['binId']);
        const seeded = btn.dataset['seeded'] === '1';
        if (Number.isFinite(id)) this.deleteContainerFromPopup(id, seeded);
      });
    });
  }

  changeMapStyle(key: string) {
    if (this.currentMapStyle === key) return;
    this.map.removeLayer(this.baseLayers[this.currentMapStyle]);
    this.baseLayers[key].addTo(this.map);
    this.currentMapStyle = key;
    localStorage.setItem('mapStyle', key);

    // Sync style in the Mapbox 3D map if it is active.
    if (this.map3d && this.map3dStyleLoaded) {
      this.map3dStyleLoaded = false;
      this.clearAll3DLayers();
      this.map3d.setStyle(this.map3dStyles[key] ?? this.map3dStyles['voyager']);
      this.map3d.once('style.load', () => {
        this.map3dStyleLoaded = true;
        this.addMapbox3DLayers();
        this.sync3DBins();
        if (this.routeActive && this.realRouteCoords.length) this.sync3DRoute();
      });
    }
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
          const target = bins.find(b => b.id === targetId);
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
      await this.confirmSvc.notify({ title: 'Изберете зона', message: 'Моля изберете зона преди да генерирате маршрут.', variant: 'warning' });
      return;
    }

    const token = this.getToken();
    if (!token) {
      await this.confirmSvc.notify({ title: 'Сесията изтече', message: 'Моля, влезте отново.', variant: 'warning' });
      this.router.navigate(['/login']);
      return;
    }

    try {
      const res = await firstValueFrom(
        this.http.get<RouteResult>(`${this.API_URL}/trucks/route`, {
          params: { areaId: this.selectedAreaId, trashType: this.selectedTrashType.toString() },
          headers: new HttpHeaders({ Authorization: `Bearer ${token}` })
        })
      );

      if (!res?.route?.length) {
        await this.confirmSvc.notify({ title: 'Няма маршрут', message: res?.message || 'Няма контейнери за събиране в тази зона.', variant: 'info' });
        return;
      }


      this.routeResult = res;
      this.routeActive = true;
      await this.visualizeRoute();

      // If 3D view is open, draw the route there too.
      if (this.show3DView && this.map3dStyleLoaded) {
        this.sync3DRoute();
      }

      setTimeout(() => {
        this.map.invalidateSize();
        if (this.routeResult?.route?.length) {
          this.map.fitBounds(
            L.latLngBounds(this.routeResult.route.map(s => [s.locationY, s.locationX] as [number, number])),
            { padding: [40, 40] }
          );
        }
      }, 60);

    } catch (e: any) {
      if (e.status === 401) {
        await this.confirmSvc.notify({ title: 'Сесията изтече', message: 'Моля, влезте отново.', variant: 'warning' });
        this.router.navigate(['/login']);
      } else if (e.status === 404) {
        await this.confirmSvc.notify({ title: 'Няма камион', message: 'В тази зона няма активен камион.', variant: 'warning' });
      } else {
        await this.confirmSvc.notify({ title: 'Грешка', message: 'Възникна грешка при генериране на маршрут.', variant: 'danger' });
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
      await this.confirmSvc.notify({ title: 'Маршрутът не е готов', message: 'Генерирайте маршрут преди да стартирате навигация.', variant: 'warning' });
      return;
    }

    this.navigationActive = true;
    this.currentStop = 0;
    this.currentTruckLoad = 0;
    this.stepPending = false;

    // Persist the run on the server BEFORE the animation starts so admins
    // viewing history can see it even if the driver closes the tab mid-run.
    // Falls back to a local-only correlation id if the request fails — live
    // tracking still works, only history is lost.
    this.driverRunId = Date.now();
    this.driverLastBroadcastAt = 0;
    this.driverLastLatLng = null;

    try {
      const persistedId = await this.openRouteRun();
      if (persistedId > 0) this.driverRunId = persistedId;
    } catch (err) {
      // Lock conflict — don't run the route at all. The toast already
      // told the user who's holding it; just bail out of navigation.
      if (err instanceof RouteLockedError) {
        this.navigationActive = false;
        this.routeActive = false;
        return;
      }
      // Other failures are non-fatal: keep local id, admins still see
      // live telemetry, only history is lost.
    }

    const { truckIcon, path, stopIndices } = this.buildNavSetup();

    // Announce to admins that a route has started.
    this.broadcastDriverPhase('start', path[0]);

    if (this.navigationMode === 'step') {
      await this.runStepNavigation(truckIcon, path, stopIndices);
    } else {
      await this.runAutoNavigation(truckIcon, path, stopIndices);
    }

    // Always announce end, even if navigation was cancelled mid-way.
    this.broadcastDriverPhase('end', this.driverLastLatLng ?? path[0]);

    // Close the persisted run. Only attempts if we have a real server id
    // (driverRunId > 1e12 means it's the local timestamp fallback).
    if (this.driverRunId > 0 && this.driverRunId < 1e12) {
      try { await this.closeRouteRun(); } catch { /* non-fatal */ }
    }
  }

  /**
   * POST the planned route to the server and return the generated runId.
   * Returns 0 if the call fails or is not applicable.
   */
  private async openRouteRun(): Promise<number> {
    const token = this.getToken();
    if (!token || !this.routeResult) return 0;

    const stops = (this.routeResult.route ?? []).map(s => ({
      id: s.id,
      areaId: s.areaId ?? this.routeResult!.areaId,
      lat: s.locationX,
      lng: s.locationY,
      fill: s.fillPercentage ?? 0,
      capacity: s.capacity ?? 0,
    }));

    const body = {
      areaId: this.routeResult.areaId,
      trashType: this.selectedTrashType,
      truckId: this.routeResult.truckId ?? null,
      plannedDistanceKm: this.routeResult.totalDistance ?? 0,
      plannedMinutes: this.routeResult.estimatedTimeMinutes ?? 0,
      stopsPlanned: this.routeResult.route.length,
      stops,
    };

    try {
      const res = await firstValueFrom(
        this.http.post<{ runId: number }>(
          `${this.API_URL}/trucks/route/start`,
          body,
          { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) },
        ),
      );
      return res?.runId ?? 0;
    } catch (err: any) {
      // 409 Conflict ⇒ another driver already holds this (area, trashType).
      // Show a clear message identifying the holder and give up cleanly so
      // the truck app doesn't half-start a route it can't actually own.
      if (err?.status === 409) {
        const e = err.error ?? {};
        const holder = e.lockedByDriverName || 'друг шофьор';
        const startedAt = e.startedAt ? new Date(e.startedAt) : null;
        const ago = startedAt ? humanAgo(startedAt) : '';
        const msg = ago
          ? `Маршрутът е стартиран ${ago}.`
          : 'Маршрутът вече е стартиран.';
        this.toast.error({
          title: `Зает от ${holder}`,
          message: msg,
          duration: 6000,
        });
        throw new RouteLockedError(msg);
      }

      // 400 Bad Request ⇒ validation failed on the server (missing area,
      // missing truck, etc.). Surface the actual server message instead of
      // letting it die silently in the network tab.
      if (err?.status === 400) {
        const serverMsg = err?.error?.message ?? 'Невалидна заявка.';
        this.toast.error({
          title: 'Маршрутът не може да се стартира',
          message: serverMsg,
          duration: 7000,
        });
        throw err;
      }

      // 503 Service Unavailable ⇒ DB hiccup or schema issue on the server.
      // Distinct from 400 (which is the user's input) — phrase it so the
      // user knows to retry rather than try to "fix" their request.
      if (err?.status === 503) {
        const serverMsg = err?.error?.message ?? 'Сървърна грешка.';
        this.toast.error({
          title: 'Базата данни не отговаря',
          message: `${serverMsg} Опитайте отново след минута.`,
          duration: 7000,
        });
        throw err;
      }

      // Anything else (500, network, etc.) — show a fallback toast so the
      // user sees something in the UI rather than just a console error.
      const fallback = err?.error?.message ?? err?.message ?? 'Сървърна грешка.';
      this.toast.error({
        title: 'Грешка при стартиране',
        message: fallback,
        duration: 6000,
      });
      throw err;
    }
  }

  /**
   * Mark the persisted run as completed (or cancelled if the driver
   * quit early). Called once at the end of startNavigation().
   */
  private async closeRouteRun(): Promise<void> {
    const token = this.getToken();
    if (!token) return;

    const totalStops = this.routeResult?.route.length ?? 0;
    const outcome = this.currentStop >= totalStops ? 'completed' : 'cancelled';

    const body = {
      stopsCompleted: this.currentStop,
      collectedLoad: this.currentTruckLoad,
      outcome,
    };

    await firstValueFrom(
      this.http.post(
        `${this.API_URL}/trucks/route/${this.driverRunId}/complete`,
        body,
        { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) },
      ),
    );
  }

  /**
   * Throttled broadcast of current driver position. Called from the
   * animation loops every frame — only actually sends if enough time
   * has elapsed since the last broadcast (default 700ms).
   */
  private broadcastDriverTelemetry(
    coord: [number, number],
    prevCoord: [number, number] | null,
    phase: 'move' | 'stop',
  ): void {
    if (!this.isDriver && !this.isAdmin) return;

    const now = Date.now();
    if (phase === 'move' && now - this.driverLastBroadcastAt < 700) return;
    this.driverLastBroadcastAt = now;

    const heading = prevCoord ? this.bearing(prevCoord, coord) : 0;

    // Approximate speed from frame-to-frame delta. Rough but good enough
    // for a status indicator.
    let speedKmh = 0;
    if (prevCoord && this.driverLastBroadcastAt > 0) {
      const km = this.dist(prevCoord, coord);
      const dtH = Math.max(0.0001, 0.7 / 3600); // 700ms assumption
      speedKmh = Math.min(90, km / dtH);
    }

    this.signalR.sendDriverPosition({
      runId:      this.driverRunId,
      areaId:     this.routeResult?.areaId ?? '',
      lat:        coord[0],
      lng:        coord[1],
      heading,
      speedKmh,
      stopIndex:  this.currentStop,
      totalStops: this.routeResult?.route.length ?? 0,
      load:       this.currentTruckLoad,
      phase,
    });

    this.driverLastLatLng = coord;
  }

  /** Announce a discrete phase change (start / end). Not throttled. */
  private broadcastDriverPhase(phase: 'start' | 'end', coord: [number, number]): void {
    if (!this.isDriver && !this.isAdmin) return;
    this.signalR.sendDriverPosition({
      runId:      this.driverRunId,
      areaId:     this.routeResult?.areaId ?? '',
      lat:        coord[0],
      lng:        coord[1],
      heading:    0,
      speedKmh:   0,
      stopIndex:  this.currentStop,
      totalStops: this.routeResult?.route.length ?? 0,
      load:       this.currentTruckLoad,
      phase,
    });
    this.driverLastBroadcastAt = Date.now();
    this.driverLastLatLng = coord;
  }

  private buildNavSetup() {
    const route = this.routeResult!.route;
    const totalKm = this.realRouteCoords.reduce(
      (acc, c, i) => i > 0 ? acc + this.dist(this.realRouteCoords[i - 1], c) : 0, 0
    );

    const FRAMES = Math.max(250, Math.round(totalKm * 70));
    const path = this.resamplePath(this.realRouteCoords, FRAMES);

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

    const bin = this.allBins.find(b => b.id === route[idx].id);
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

    firstValueFrom(
      this.http.put(
        `${this.API_URL}/containers/${route[idx].id}/empty`, {},
        token ? { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) } : {}
      )
    ).catch(() => {});
  }

  private panIfNearEdge(coord: [number, number]): void {
    const bounds = this.map.getBounds();
    const [lat, lng] = coord;
    const latR = bounds.getNorth() - bounds.getSouth();
    const lngR = bounds.getEast()  - bounds.getWest();
    const p = 0.22;

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
        const deg = this.bearing(path[i - 1], path[i]);
        const el = this.truckMarker.getElement();
        const wrap = el?.querySelector('.truck-marker-wrap') as HTMLElement | null;
        if (wrap) wrap.style.transform = `rotate(${deg}deg)`;
      }

      if (i % 20 === 0) this.panIfNearEdge(path[i]);
      if (i % 5  === 0) this.updateTruck3D(path[i][0], path[i][1]);

      let needsRerender = false;
      while (si < route.length && i >= stopIndices[si]) {
        this.doCollectStop(si, route, token);
        needsRerender = true;
        si++;
        // A stop was reached — broadcast once at the stop point so admins
        // see the "pause" phase explicitly, not just a throttled move.
        this.broadcastDriverTelemetry(path[i], i > 0 ? path[i - 1] : null, 'stop');
      }
      if (needsRerender) this.renderBins(this.filtered());

      // Throttled (700ms) telemetry to admins.
      this.broadcastDriverTelemetry(path[i], i > 0 ? path[i - 1] : null, 'move');

      await new Promise(r => setTimeout(r, Math.max(4, Math.floor(22 / this.speedMultiplier))));
    }

    while (si < route.length) { this.doCollectStop(si, route, token); si++; }
    if (si > 0) this.renderBins(this.filtered());

    this.navigationActive = false;
    const load = this.currentTruckLoad;
    this.currentTruckLoad = 0;
    this.currentCollectedStop = null;   // Bug 4 fix: clear stale UI data
    this.loadBins();   // refresh from server after emptying

    this.toast.success({
      title: '✅ Маршрут завършен',
      message: `Посетени спирки: ${route.length}`,
      detail: `Събран товар: ${load.toFixed(0)} л`,
      prominent: true,
    });
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
          const deg = this.bearing(path[i - 1], path[i]);
          const el = this.truckMarker.getElement();
          const wrap = el?.querySelector('.truck-marker-wrap') as HTMLElement | null;
          if (wrap) wrap.style.transform = `rotate(${deg}deg)`;
        }

        if (i % 20 === 0) this.panIfNearEdge(path[i]);
        if (i % 5  === 0) this.updateTruck3D(path[i][0], path[i][1]);

        this.broadcastDriverTelemetry(path[i], i > 0 ? path[i - 1] : null, 'move');

        await new Promise(r => setTimeout(r, Math.max(4, Math.floor(22 / this.speedMultiplier))));
      }

      if (!this.navigationActive) break;

      this.doCollectStop(si, route, token);
      this.broadcastDriverTelemetry(path[toFrame], toFrame > 0 ? path[toFrame - 1] : null, 'stop');
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
      this.currentCollectedStop = null;   // Bug 4 fix: clear stale UI data
      this.loadBins();   // refresh from server after emptying

      this.toast.success({
        title: '✅ Маршрут завършен',
        message: `Посетени спирки: ${route.length}`,
        detail: `Събран товар: ${load.toFixed(0)} л`,
        prominent: true,
      });
    }

    this.stepPending = false;
  }

  confirmNextStep(): void {
    this.stepPending = false;
    this._stepResolve?.();
    this._stepResolve = undefined;
  }

  triggerBreakdown(): void {
    const idx = Math.max(0, this.currentStop - 1);
    const stop = this.routeResult?.route[idx];
    const zoneName = this.routeResult?.areaId ?? 'Неизвестна зона';
    const stopName = stop
      ? `Контейнер #${stop.id} (Спирка ${this.currentStop})`
      : 'Неизвестно';

    this.navigationActive = false;
    this.stepPending = false;
    this._stepResolve?.();
    this._stepResolve = undefined;

    this.selectedReportType = 'TruckProblem';
    this.reportDescription =
      `🚨 Камионът е повреден в ${zoneName}. Последна спирка: ${stopName}.`;

    this.toggleReportPanel(true);

    this.clearRoute();
    this.routeActive = false;
    this.routeResult = null;
    this.currentStop = 0;
    this.currentTruckLoad = 0;
    this.loadBins();
  }



  stopRoute() {
    this.navigationActive = false;
    // Unblock runStepNavigation if it is awaiting user confirmation — without
    // this the Promise created in confirmNextStep() never resolves, leaking a
    // hung async loop.
    this._stepResolve?.();
    this._stepResolve = undefined;
    this.stepPending = false;
    this.currentCollectedStop = null;   // Bug 4: reset stale UI data
    this.clearRoute();
    this.routeResult = null;
    this.routeActive = false;
    this.currentStop = 0;
    this.currentTruckLoad = 0;
    this.selectedAreaId = '';
    this.selectedTrashType = 0;
  }

  private clearRoute() {
    if (this.routeLine)   { this.map.removeLayer(this.routeLine);   this.routeLine = undefined; }
    if (this.truckMarker) { this.map.removeLayer(this.truckMarker); this.truckMarker = undefined; }
    this.routeMarkers.forEach(m => this.map.removeLayer(m));
    this.routeMarkers = [];
    this.realRouteCoords = [];
    // Bug 3 fix: search is an independent feature — do NOT call clearSearch() here.
    this.clear3DRouteLayers();
  }

  private clear3DRouteLayers(): void {
    if (!this.map3d) return;
    ['route-glow-3d', 'route-line-3d', 'stops-outer-3d', 'stops-label-3d', 'truck-layer-3d', 'truck-glow-3d']
      .forEach(id => { try { if (this.map3d.getLayer(id)) this.map3d.removeLayer(id); } catch {} });
    ['route-3d', 'stops-3d', 'truck-src-3d']
      .forEach(id => { try { if (this.map3d.getSource(id)) this.map3d.removeSource(id); } catch {} });
  }

  /** Remove all BinMaps-added layers/sources from 3D map (called on style change) */
  private clearAll3DLayers(): void {
    if (!this.map3d) return;
    [
      'route-glow-3d', 'route-line-3d', 'stops-outer-3d', 'stops-label-3d',
      'truck-layer-3d', 'truck-glow-3d',
      'bins-cluster', 'bins-cluster-count', 'bins-dot',
      'buildings-3d', 'sky'
    ].forEach(id => { try { if (this.map3d.getLayer(id)) this.map3d.removeLayer(id); } catch {} });
    [
      'route-3d', 'stops-3d', 'truck-src-3d', 'bins-3d', 'mapbox-dem'
    ].forEach(id => { try { if (this.map3d.getSource(id)) this.map3d.removeSource(id); } catch {} });
  }

  toggleReportPanel(show: boolean) {
    this.showReportPanel = show;
    setTimeout(() => this.map?.invalidateSize(), 350);
  }

  toggleRoutePanel(show: boolean) {
    this.showRoutePanel = show;
    setTimeout(() => this.map?.invalidateSize(), 350);
  }



  /**
   * Diff-update markers on the cluster layer.
   *
   * Previously this method did `cluster.clearLayers()` followed by re-adding
   * every marker. Every SignalR push (once per minute from the dynamics
   * service) rebuilt the whole cluster — which closed any open popup and,
   * combined with `chunkedLoading: true`, made the icons briefly disappear
   * and "reload" on the map. Users perceived that as a loading spinner.
   *
   * The new version updates existing markers in place (icon + popup HTML)
   * and only adds/removes markers whose id entered or left the filtered set.
   * A marker with an open popup is preserved, so the popup stays visible
   * while its numbers tick forward in real time.
   */
  private renderBins(bins: Bin[]) {
    const nextIds = new Set(bins.map(b => b.id));

    // 1) Remove markers that no longer belong to the filtered set.
    for (const [id, marker] of this.binMarkers) {
      if (!nextIds.has(id)) {
        this.cluster.removeLayer(marker);
        this.binMarkers.delete(id);
      }
    }

    // 2) Add new markers, refresh existing ones in place.
    bins.forEach(bin => {
      let marker = this.binMarkers.get(bin.id);

      if (!marker) {
        marker = L.marker(
          [bin.locationY, bin.locationX],
          { icon: this.createBinIcon(bin), binId: bin.id } as any
        );

        if (!this.isGuest) {
          marker.bindPopup(
            this.createPopup(bin),
            { maxWidth: 280, className: 'bpp-container' }
          );
        }

        if ((this.isUser || this.isDriver) && !this.navigationActive) {
          marker.on('click', () => {
            this.selectedBinForReport = bin;
            this.reportResult = null;
            this.reportSubmitting = false;

            const el = document.getElementById('selected-bin-id') as HTMLInputElement;
            if (el) el.value = `Контейнер #${bin.id}`;
          });
        }

        this.binMarkers.set(bin.id, marker);
        this.cluster.addLayer(marker);
        return;
      }

      // Existing marker — refresh icon and popup HTML in place, so the
      // live numbers update without destroying the DOM or closing the popup.
      marker.setIcon(this.createBinIcon(bin));

      const popup = marker.getPopup();
      if (popup) {
        popup.setContent(this.createPopup(bin));
      }

      // If coordinates somehow changed (admin edit), reposition without
      // re-adding to the cluster.
      const ll = marker.getLatLng();
      if (ll.lat !== bin.locationY || ll.lng !== bin.locationX) {
        marker.setLatLng([bin.locationY, bin.locationX]);
      }
    });

    // Keep 3D map in sync with whatever filter/state produced this render.
    if (this.show3DView && this.map3dStyleLoaded) {
      this.sync3DBins();
    }
  }

  // Zone boundaries were removed — the map no longer draws polygons around
  // area groups. Area filtering still works via the zone dropdown.

  private createBinIcon(bin: Bin): L.DivIcon {
    const f = Math.round(bin.fillPercentage);
    const temp = bin.temperature ?? 0;
    const isFire = bin.status === 2 || (temp > 55 && bin.fillPercentage > 70);
    const isSensorBroke = !isFire && bin.status === 3;           
    const isOffline = !isFire && bin.status === 1;           
    const isBroken = isSensorBroke || isOffline;
    const isWarm = temp > 44 && !isFire;

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
    const f = bin.fillPercentage;
    const liters = Math.round(f / 100 * 1100);
    const temp = bin.temperature;
    const isFire = bin.status === 2 || (temp !== null && temp! > 55 && bin.fillPercentage > 70);
    const isWarm = temp !== null && temp! > 44 && !isFire;
    const ring = f >= 85 ? '#ef4444' : f >= 65 ? '#f97316' : f >= 45 ? '#f59e0b' : '#10b981';

    const typeLbl = ['Смесен', 'Пластмаса', 'Хартия', 'Стъкло'][bin.trashType] ?? '';
    const typeBg = ['rgba(148,163,184,.18)', 'rgba(245,158,11,.18)', 'rgba(59,130,246,.18)', 'rgba(34,211,238,.18)'][bin.trashType];
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
            <span style="color:${bin.hasSensor ? (bin.status === 3 ? '#f59e0b' : bin.status === 1 ? '#ef4444' : '#22d3ee') : '#475569'};font-weight:700">
              ${bin.hasSensor ? (bin.status === 3 ? 'Счупен' : bin.status === 1 ? 'Офлайн' : 'Активен') : 'Без сензор'}
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

        ${this.isAdmin ? `
          <button class="bpp-delete-btn" data-bin-id="${bin.id}" data-seeded="${bin.isSeeded ? '1' : '0'}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
            <span>Архивирай</span>
          </button>
        ` : ''}

      </div>`;
  }

  /**
   * Called from inside the popup when the admin hits the delete button.
   * Always soft-deletes — the container moves to the admin "Архивирани" tab
   * where it can be restored or removed permanently.
   */
  async deleteContainerFromPopup(id: number, seeded: boolean): Promise<void> {
    const ok = await this.confirmSvc.ask({
      title: 'Архивиране на контейнер',
      message: `Да архивирам ли контейнер #${id}?`,
      detail: 'Контейнерът ще бъде преместен в таб „Архивирани" в админ панела, откъдето може да бъде възстановен или изтрит окончателно.',
      confirmText: 'Архивирай',
      variant: 'warning',
    });
    if (!ok) return;

    this.http.delete<{ id: number; mode: string }>(
      `${this.API_URL}/containers/${id}`,
    ).subscribe({
      next: res => {
        this.removeBinLocally(id);
        console.log(`Container ${id} archived`, res);
      },
      error: err => {
        console.error('Archive failed', err);
        this.confirmSvc.notify({
          title: 'Грешка при архивиране',
          message: err?.error?.message ?? err.message ?? 'Неизвестна грешка.',
          variant: 'danger'
        });
      }
    });
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
          const fcBody = el.querySelector('#fc-body')   as HTMLElement      | null;
          let collapsed = false;

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
          const searchBtn = el.querySelector('#bin-search-btn')   as HTMLButtonElement;
          const doSearch = () => self.searchNearestBin(searchInput.value);

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
      const opt = document.createElement('option');
      opt.value = z;
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
      await this.confirmSvc.notify({ title: 'Не е намерен', message: `Контейнер ${q} не съществува.`, variant: 'warning' });
      return;
    }

    let lat: number, lon: number;

    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ', София, България')}&format=json&limit=1&accept-language=bg`;
      const res = await (await fetch(url)).json();
      if (!res?.length) { await this.confirmSvc.notify({ title: 'Адресът не е намерен', message: 'Опитайте с по-конкретен адрес.', variant: 'warning' }); return; }
      lat = parseFloat(res[0].lat);
      lon = parseFloat(res[0].lon);
    } catch {
      await this.confirmSvc.notify({ title: 'Геокодиране', message: 'Грешка при търсене на адреса.', variant: 'danger' });
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

    const RADIUS_M = 500;
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
      this.confirmSvc.notify({ title: 'Невалиден формат', message: 'Разрешени са само JPEG, PNG и GIF файлове.', variant: 'warning' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.confirmSvc.notify({ title: 'Файлът е твърде голям', message: 'Максималният размер е 5 MB.', variant: 'warning' });
      return;
    }

    this.selectedFile = file;
    this.photoNoBinWarning = false;
    this.photoAnalysisCache = null;

    const r = new FileReader();
    r.onload = (e: any) => { this.reportImagePreview = e.target.result; };
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
          const containerDetected: boolean = res?.container_detected ?? true;
          this.photoNoBinWarning = !containerDetected;
          this.photoAnalysisCache = {
            containerDetected,
            detectedClass: res?.detected_class ?? '',
            confidence: res?.confidence ?? 0
          };
        },
        error: () => { this.photoCheckingPreview = false; }
      });
    }
  }

  clearImagePreview() {
    this.reportImagePreview = null;
    this.selectedFile = null;
    this.photoNoBinWarning = false;
    this.photoCheckingPreview = false;
    this.photoAnalysisCache = null;
    const el = document.getElementById('report-image') as HTMLInputElement;
    if (el) el.value = '';
  }

  async submitReport() {
    if (this.reportSubmitting || this.reportCheckingPhoto) return;

    if (!this.currentUser) {
      await this.confirmSvc.notify({ title: 'Нужна е регистрация', message: 'Моля, влезте в системата преди да подадете сигнал.', variant: 'warning' });
      this.router.navigate(['/login']);
      return;
    }

    const desc = document.getElementById('report-description') as HTMLTextAreaElement;
    const reportType = this.selectedReportType;
    const isTruckProblem = reportType === 'TruckProblem';

    if (!isTruckProblem && !this.selectedBinForReport) {
      await this.confirmSvc.notify({ title: 'Контейнер не е избран', message: 'Изберете контейнер от картата преди да изпратите сигнал.', variant: 'warning' });
      return;
    }

    const token = this.getToken();
    if (!token) {
      await this.confirmSvc.notify({ title: 'Сесията изтече', message: 'Моля, влезте отново.', variant: 'warning' });
      this.router.navigate(['/login']);
      return;
    }

    const isAiReport = reportType === 'Full' || reportType === 'Fire';
    let preCheckResult: { containerDetected: boolean; detectedClass: string; confidence: number } | null = null;

    if (this.selectedFile && isAiReport) {
      if (this.photoAnalysisCache) {
        preCheckResult = this.photoAnalysisCache;
      } else {
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
          const detectedClass: string = check?.detected_class ?? '';
          const confidence: number = check?.confidence ?? 0;

          preCheckResult = { containerDetected, detectedClass, confidence };
        } catch {
          this.reportCheckingPhoto = false;
          preCheckResult = { containerDetected: false, detectedClass: '', confidence: 0 };
        }
      }

      const { containerDetected, detectedClass, confidence } = preCheckResult;

      if (!containerDetected) {
        const proceed = await this.showAiModal('noBin', '', '', '', 0);
        if (!proceed) return;
      } else if (detectedClass && confidence > 0) {
        const classInfo = this.getAiClassInfo(detectedClass);
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

    if (desc?.value) fd.append('Description', desc.value);
    if (this.selectedFile) fd.append('Photo', this.selectedFile);

    if (preCheckResult) {
      fd.append('PreComputedContainerDetected', preCheckResult.containerDetected.toString());
      fd.append('PreComputedDetectedClass', preCheckResult.detectedClass);
      fd.append('PreComputedConfidence', preCheckResult.confidence.toString());
    }

    const hadPhoto = !!this.selectedFile;
    this.reportSubmitting = true;

    this.http
      .post<any>(`${this.API_URL}/reports`, fd, {
        headers: new HttpHeaders({ Authorization: `Bearer ${token}` })
      })
      .subscribe({
        next: res => {
          this.reportSubmitting = false;
          this.reportResult = {
            ...res,
            hadPhoto,
            containerDetected: res.containerDetected ?? true
          };
          this.selectedBinForReport = null;
          this.reportImagePreview = null;
          this.selectedFile = null;
          this.reportDescription = '';
          this.selectedReportType = 'Full';

          const si = document.getElementById('selected-bin-id') as HTMLInputElement;
          if (si)   si.value = '';
          if (desc) desc.value = '';

          setTimeout(() => this.loadBins(), 800);
        },
        error: e => {
          this.reportSubmitting = false;

          if (e.status === 401) {
            this.confirmSvc.notify({ title: 'Сесията изтече', message: 'Моля, влезте отново.', variant: 'warning' });
            this.router.navigate(['/login']);
          } else {
            this.confirmSvc.notify({ title: 'Грешка', message: 'Изпращането на сигнала не успя.', variant: 'danger' });
          }
        }
      });
  }

  clearReportResult() {
    this.reportResult = null;
  }



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
      const d = (k / (count - 1)) * total;
      let lo = 0;
      let hi = cum.length - 1;

      while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= d) lo = mid; else hi = mid;
      }

      const t = (cum[hi] - cum[lo]) > 0 ? (d - cum[lo]) / (cum[hi] - cum[lo]) : 0;
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
    const R = 6371;
    const dLat = (b[0] - a[0]) * Math.PI / 180;
    const dLon = (b[1] - a[1]) * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2
               + Math.cos(a[0] * Math.PI / 180)
               * Math.cos(b[0] * Math.PI / 180)
               * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  private getToken(): string | null {
    return this.authService.getToken();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3D MAP  (Mapbox GL JS — overlay over Leaflet)
  // ══════════════════════════════════════════════════════════════════════════

  toggle3DFullscreen(): void {
    this.map3dFullscreen = !this.map3dFullscreen;
    setTimeout(() => this.map3d?.resize(), 60);
  }

  async toggle3DView(): Promise<void> {
    this.show3DView = !this.show3DView;

    if (!this.show3DView) {
      this.map3dFullscreen = false;
    }

    if (this.show3DView) {
      if (!this.map3d) {
        await new Promise(r => setTimeout(r, 0));
        await this.init3DMap();
      } else {
        const c = this.map.getCenter();
        this.map3d.setCenter([c.lng, c.lat]);
        this.map3d.setZoom(this.map.getZoom() - 0.5);
        this.refresh3DLayers();
      }
      // Always force a resize so the canvas fills the now-visible container.
      setTimeout(() => this.map3d?.resize(), 80);
    }
  }

  private async loadMapboxScript(): Promise<void> {
    if ((window as any).mapboxgl) return;

    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css';
    document.head.appendChild(link);

    await new Promise<void>((resolve, reject) => {
      const script   = document.createElement('script');
      script.src     = 'https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js';
      script.onload  = () => resolve();
      script.onerror = () => reject(new Error('Mapbox GL failed to load'));
      document.head.appendChild(script);
    });
  }

  /** Move the truck marker on the 3D map during navigation */
  private updateTruck3D(lat: number, lng: number): void {
    if (!this.map3d || !this.map3dStyleLoaded) return;

    const point = { type: 'Feature' as const,
                    geometry: { type: 'Point' as const, coordinates: [lng, lat] },
                    properties: {} };

    const src = this.map3d.getSource('truck-src-3d') as any;
    if (src) {
      src.setData(point);
      return;
    }

    // First call — load the truck SVG as a Mapbox image, then add source + layers.
    const truckSvg = `<svg width="26" height="50" viewBox="0 0 26 50" fill="none" xmlns="http://www.w3.org/2000/svg">
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
      <rect x="-1"   y="6"    width="4"  height="9"   rx="2"   fill="#0f172a"/>
      <rect x="-0.5" y="7"    width="3"  height="7"   rx="1.5" fill="#1e293b"/>
      <rect x="23"   y="6"    width="4"  height="9"   rx="2"   fill="#0f172a"/>
      <rect x="23.5" y="7"    width="3"  height="7"   rx="1.5" fill="#1e293b"/>
      <rect x="-1"   y="21"   width="4"  height="8"   rx="2"   fill="#0f172a"/>
      <rect x="-1"   y="31.5" width="4"  height="8"   rx="2"   fill="#0f172a"/>
      <rect x="23"   y="21"   width="4"  height="8"   rx="2"   fill="#0f172a"/>
      <rect x="23"   y="31.5" width="4"  height="8"   rx="2"   fill="#0f172a"/>
    </svg>`;

    // Rasterize the inline truck SVG to a canvas — same fix as sync3DBins:
    // Mapbox GL cannot decode SVG blobs via loadImage().
    this.svgToCanvas(truckSvg, 52, 100).then(imageData => {
      if (!this.map3d || !this.map3dStyleLoaded) return;

      if (!this.map3d.hasImage('icon3d-truck')) {
        this.map3d.addImage('icon3d-truck', imageData);
      }

      this.map3d.addSource('truck-src-3d', { type: 'geojson', data: point });

      // Soft green glow ring.
      this.map3d.addLayer({
        id: 'truck-glow-3d', type: 'circle', source: 'truck-src-3d',
        paint: {
          'circle-radius':       20,
          'circle-color':        '#10b981',
          'circle-opacity':      0.18,
          'circle-stroke-width': 0
        }
      });

      // Truck SVG icon.
      this.map3d.addLayer({
        id: 'truck-layer-3d', type: 'symbol', source: 'truck-src-3d',
        layout: {
          'icon-image':            'icon3d-truck',
          'icon-size':             0.65,
          'icon-allow-overlap':    true,
          'icon-ignore-placement': true,
          'icon-anchor':           'center'
        }
      });
    }).catch(e => console.warn('Truck icon 3D load failed', e));
  }

  private async init3DMap(): Promise<void> {
    try {
      await this.loadMapboxScript();
    } catch {
      console.error('Mapbox GL could not be loaded');
      this.show3DView = false;
      return;
    }

    // Guard: if token is missing the map crashes mid-init and leaves the
    // container dirty, causing "container not empty" + mouse-event crashes
    // on every subsequent hover. Bail out cleanly instead.
    if (!this.MAPBOX_TOKEN) {
      console.error('Mapbox token is missing — set mapboxToken in environment.ts');
      this.show3DView = false;
      await this.confirmSvc.notify({
        title: '3D карта недостъпна',
        message: 'Липсва Mapbox API ключ.',
        detail: 'Конфигурирайте mapboxToken в environment.ts.',
        variant: 'warning'
      });
      return;
    }

    // Clear the container so Mapbox never sees stale DOM from a previous
    // failed init (avoids the "container not empty" warning and vec4 crashes).
    const container = document.getElementById('map-3d');
    if (container) container.innerHTML = '';

    const mbx    = (window as any).mapboxgl;
    mbx.accessToken = this.MAPBOX_TOKEN;

    const center = this.map.getCenter();

    try {
      this.map3d = new mbx.Map({
        container:          'map-3d',
        style:              this.map3dStyles[this.currentMapStyle] ?? this.map3dStyles['voyager'],
        center:             [center.lng, center.lat],
        zoom:               this.map.getZoom() - 0.5,
        pitch:              50,
        bearing:            -15,
        maxBounds:          [[23.15, 42.55], [23.50, 42.85]],
        attributionControl: false,
        antialias:          true
      });
    } catch (e) {
      console.error('Mapbox Map init failed:', e);
      this.map3d = null;
      this.show3DView = false;
      return;
    }

    this.map3d.addControl(new mbx.NavigationControl({ showCompass: true, showZoom: true }), 'bottom-left');

    this.map3d.on('load', () => {
      this.map3dStyleLoaded = true;
      this.addMapbox3DLayers();
      this.map3d.resize();
      this.sync3DBins();
      if (this.routeActive && this.realRouteCoords.length) this.sync3DRoute();
    });

    // If the map errors (e.g. invalid token), clean up so the next toggle
    // attempt gets a fresh start rather than reusing the broken instance.
    this.map3d.on('error', (e: any) => {
      console.error('Mapbox map error:', e);
      if (!this.map3dStyleLoaded) {
        this.map3d?.remove?.();
        this.map3d = null;
        this.map3dStyleLoaded = false;
        this.show3DView = false;
      }
    });
  }

  /** Add terrain, sky and 3D buildings — called after every style load/change */
  private addMapbox3DLayers(): void {
    if (!this.map3d) return;

    // ── Terrain (real elevation mesh) ──────────────────────────────────────
    if (!this.map3d.getSource('mapbox-dem')) {
      this.map3d.addSource('mapbox-dem', {
        type:     'raster-dem',
        url:      'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom:  14
      });
    }
    this.map3d.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });

    // ── Sky layer ──────────────────────────────────────────────────────────
    if (!this.map3d.getLayer('sky')) {
      this.map3d.addLayer({
        id:   'sky',
        type: 'sky',
        paint: {
          'sky-type':                    'atmosphere',
          'sky-atmosphere-sun':          [0.0, 0.0],
          'sky-atmosphere-sun-intensity': 15
        }
      });
    }

    // ── 3D buildings from Mapbox vector tiles (no Overpass needed) ─────────
    this.load3DBuildings();
  }

  private load3DBuildings(): void {
    if (!this.map3d || !this.map3dStyleLoaded) return;
    if (this.map3d.getLayer('buildings-3d')) return; // already present

    // Mapbox vector tiles include building footprints + heights in the
    // 'composite' source. No Overpass API call needed — buildings load
    // instantly, pan/zoom smoothly, and never 429/504.
    this.map3d.addLayer({
      id:             'buildings-3d',
      source:         'composite',
      'source-layer': 'building',
      filter:         ['==', 'extrude', 'true'],
      type:           'fill-extrusion',
      minzoom:        14,
      paint: {
        'fill-extrusion-color': [
          'interpolate', ['linear'], ['get', 'height'],
          0,   '#c8bfb0',
          8,   '#bbb5a8',
          18,  '#a8adb5',
          35,  '#9aa2ae',
          60,  '#8d9bab'
        ],
        // Fade buildings in as you zoom past 14 so they don't pop.
        'fill-extrusion-height': [
          'interpolate', ['linear'], ['zoom'],
          14, 0, 14.5, ['get', 'height']
        ],
        'fill-extrusion-base': [
          'interpolate', ['linear'], ['zoom'],
          14, 0, 14.5, ['get', 'min_height']
        ],
        'fill-extrusion-vertical-gradient': true,
        'fill-extrusion-opacity':           0.90
      }
    });
  }

  /**
   * Rasterize an SVG (URL or inline string) to an ImageData object.
   * Returns ImageData so Mapbox addImage() always gets explicit width/height/data.
   */
  private async svgToCanvas(source: string, w = 64, h = 64): Promise<ImageData> {
    const svgText = source.trimStart().startsWith('<')
      ? source
      : await fetch(source).then(r => r.text());

    // Stamp explicit width/height so the browser can measure + decode the SVG.
    const stamped = /\bwidth=/.test(svgText)
      ? svgText
      : svgText.replace('<svg', `<svg width="${w}" height="${h}"`);

    const blob    = new Blob([stamped], { type: 'image/svg+xml' });
    const blobUrl = URL.createObjectURL(blob);

    return new Promise<ImageData>((resolve, reject) => {
      const img = new Image(w, h);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(blobUrl);
        // Extract pixel data explicitly — ImageData.width/height/data are always
        // correct, unlike HTMLCanvasElement which Mapbox may misread.
        resolve(ctx.getImageData(0, 0, w, h));
      };
      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        reject(new Error(`SVG decode failed: ${source.slice(0, 60)}`));
      };
      img.src = blobUrl;
    });
  }

  private async sync3DBins(): Promise<void> {
    if (!this.map3d || !this.map3dStyleLoaded) return;

    const typeNames = ['mixed', 'plastic', 'paper', 'glass'];

    // Use filtered() so zone/type/fill filters from the filter panel
    // apply in 3D exactly as they do in the 2D Leaflet map.
    const binsToShow = this.filtered();

    const features = binsToShow.map(b => {
      const isFire    = b.status === 2 || ((b.temperature ?? 0) > 55 && b.fillPercentage > 70);
      const isBroken  = b.status === 1 || b.status === 3;
      const iconImage = isFire ? 'icon3d-burning' : isBroken ? 'icon3d-broken'
                        : `icon3d-bin-${typeNames[b.trashType] ?? 'mixed'}`;
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [b.locationX, b.locationY] },
        properties: { id: b.id, fill: b.fillPercentage, iconImage }
      };
    });

    const geojson = { type: 'FeatureCollection' as const, features };

    // If source already exists AND layers are present, just refresh data.
    if (this.map3d.getSource('bins-3d') && this.map3d.getLayer('bins-dot')) {
      (this.map3d.getSource('bins-3d') as any).setData(geojson);
      return;
    }
    // If source exists but layers were lost (e.g. after setStyle), remove source
    // first so we can rebuild everything cleanly.
    if (this.map3d.getSource('bins-3d')) {
      ['bins-cluster', 'bins-cluster-count', 'bins-dot']
        .forEach(id => { try { if (this.map3d.getLayer(id)) this.map3d.removeLayer(id); } catch {} });
      try { this.map3d.removeSource('bins-3d'); } catch {}
    }

    // Preload SVG icons, then add source + layers once all images are ready.
    const icons: { id: string; url: string }[] = [
      ...typeNames.map(n => ({ id: `icon3d-bin-${n}`, url: `assets/icons/bin-${n}.svg` })),
      { id: 'icon3d-burning',  url: 'assets/icons/bin-burning.svg'       },
      { id: 'icon3d-broken',   url: 'assets/icons/bin-broken.svg'        },
    ];

    // Preload SVG icons via canvas rasterization — Mapbox's loadImage() cannot
    // decode SVG files directly (InvalidStateError: source image could not be decoded).
    Promise.all(
      icons.map(async ({ id, url }) => {
        if (this.map3d.hasImage(id)) return;
        try {
          const imageData = await this.svgToCanvas(url, 64, 64);
          if (!this.map3d.hasImage(id)) this.map3d.addImage(id, imageData);
        } catch (e) {
          console.warn(`3D icon load failed: ${id}`, e);
        }
      })
    ).then(() => {
      if (!this.map3d || !this.map3dStyleLoaded) return;

      // Enable Mapbox's built-in clustering — mirrors Leaflet's
      // MarkerClusterGroup from the 2D map so the 3D view isn't overwhelmed.
      this.map3d.addSource('bins-3d', {
        type: 'geojson',
        data: geojson,
        cluster:         true,
        clusterMaxZoom:  15,   // unclusters at zoom 16+
        clusterRadius:   50
      });

      // ── Cluster bubble — matches the 2D Leaflet MarkerClusterGroup style ──
      // Small (<10): r=20, Medium (10–49): r=25, Large (50+): r=30
      // White border + green glow shadow exactly as in .marker-cluster CSS.
      this.map3d.addLayer({
        id: 'bins-cluster', type: 'circle', source: 'bins-3d',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step', ['get', 'point_count'],
            '#10b981',  // small  < 10
            10, '#10b981',  // medium 10–49
            50, '#059669'   // large  50+
          ],
          'circle-radius': [
            'step', ['get', 'point_count'],
            20,   // small  < 10
            10, 25,   // medium 10–49
            50, 30    // large  50+
          ],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
          'circle-opacity':      1.0
        }
      });

      // Cluster count label — bold white, same as the 2D cluster span
      this.map3d.addLayer({
        id: 'bins-cluster-count', type: 'symbol', source: 'bins-3d',
        filter: ['has', 'point_count'],
        layout: {
          'text-field':         ['get', 'point_count_abbreviated'],
          'text-font':          ['Open Sans Semibold', 'Arial Unicode MS Regular'],
          'text-size':          ['step', ['get', 'point_count'], 13, 10, 14, 50, 15],
          'text-allow-overlap': true
        },
        paint: {
          'text-color': '#ffffff',
          // Subtle halo so the number reads clearly over any tile style
          'text-halo-color': 'rgba(5,150,105,0.6)',
          'text-halo-width': 1
        }
      });

      // ── Individual bin icon (unclustered) ────────────────────────────────
      this.map3d.addLayer({
        id: 'bins-dot', type: 'symbol', source: 'bins-3d',
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image':            ['get', 'iconImage'],
          'icon-size':             0.55,
          'icon-allow-overlap':    true,
          'icon-ignore-placement': true,
          'icon-anchor':           'center'
        }
      });

      const mbx = (window as any).mapboxgl;

      // Clicking a cluster zooms in to expand it.
      this.map3d.on('click', 'bins-cluster', (e: any) => {
        const features = this.map3d.queryRenderedFeatures(e.point, { layers: ['bins-cluster'] });
        const clusterId = features[0].properties['cluster_id'];
        (this.map3d.getSource('bins-3d') as any).getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
          if (err) return;
          this.map3d.easeTo({ center: features[0].geometry.coordinates, zoom });
        });
      });
      this.map3d.on('mouseenter', 'bins-cluster', () => { this.map3d.getCanvas().style.cursor = 'pointer'; });
      this.map3d.on('mouseleave', 'bins-cluster', () => { this.map3d.getCanvas().style.cursor = ''; });

      // Click — identical popup logic as 2D map.
      this.map3d.on('click', 'bins-dot', (e: any) => {
        const id  = e.features[0].properties.id;
        const bin = this.allBins.find(b => b.id === id);
        if (!bin) return;

        if ((this.isUser || this.isDriver) && !this.navigationActive) {
          this.selectedBinForReport = bin;
          this.reportResult = null;
          this.reportSubmitting = false;
          const el = document.getElementById('selected-bin-id') as HTMLInputElement;
          if (el) el.value = `Контейнер #${bin.id}`;
        }

        if (!this.isGuest) {
          new mbx.Popup({ maxWidth: '300px', className: 'bpp-container' })
            .setLngLat(e.lngLat)
            .setHTML(this.createPopup(bin))
            .addTo(this.map3d);
        }
      });

      this.map3d.on('mouseenter', 'bins-dot', () => { this.map3d.getCanvas().style.cursor = 'pointer'; });
      this.map3d.on('mouseleave', 'bins-dot', () => { this.map3d.getCanvas().style.cursor = ''; });
    });
  }

  private sync3DRoute(): void {
    if (!this.map3d || !this.map3dStyleLoaded || !this.routeResult || !this.realRouteCoords.length) return;

    // realRouteCoords are [lat, lng]; Mapbox needs [lng, lat]
    const lineCoords = this.realRouteCoords.map(c => [c[1], c[0]]);

    const routeGeoJSON = {
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: lineCoords },
      properties: {}
    };

    const avg  = this.routeResult.route.reduce((s, r) => s + r.fillPercentage, 0) / this.routeResult.route.length;
    const lineColor = this.routeColor(avg);

    const stopsGeoJSON = {
      type: 'FeatureCollection' as const,
      features: this.routeResult.route.map(s => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [s.locationX, s.locationY] },
        properties: { stop: s.stopNumber, fill: s.fillPercentage }
      }))
    };

    // If sources exist just update data
    if (this.map3d.getSource('route-3d')) {
      (this.map3d.getSource('route-3d') as any).setData(routeGeoJSON);
      (this.map3d.getSource('stops-3d') as any).setData(stopsGeoJSON);
      return;
    }

    this.map3d.addSource('route-3d', { type: 'geojson', data: routeGeoJSON });
    this.map3d.addSource('stops-3d', { type: 'geojson', data: stopsGeoJSON });

    // Wide glow underneath
    this.map3d.addLayer({
      id: 'route-glow-3d', type: 'line', source: 'route-3d',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': lineColor, 'line-width': 14, 'line-opacity': 0.18, 'line-blur': 6 }
    });

    // Solid main line
    this.map3d.addLayer({
      id: 'route-line-3d', type: 'line', source: 'route-3d',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': lineColor, 'line-width': 4.5, 'line-opacity': 0.92 }
    });

    // Stop circles — same blue style as the 2D .route-stop-marker
    this.map3d.addLayer({
      id: 'stops-outer-3d', type: 'circle', source: 'stops-3d',
      paint: {
        'circle-radius':        16,
        'circle-color':         '#3b82f6',
        'circle-stroke-width':  3,
        'circle-stroke-color':  '#ffffff'
      }
    });

    this.map3d.addLayer({
      id: 'stops-label-3d', type: 'symbol', source: 'stops-3d',
      layout: {
        'text-field':         ['to-string', ['get', 'stop']],
        'text-font':          ['Open Sans Semibold', 'Arial Unicode MS Regular'],
        'text-size':          12,
        'text-allow-overlap': true
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': 'rgba(37,99,235,0.5)',
        'text-halo-width': 1
      }
    });
  }


  private refresh3DLayers(): void {
    if (!this.map3dStyleLoaded) return;
    // Buildings are baked into the Mapbox style via addMapbox3DLayers() on
    // every style.load event — no manual reload needed on camera changes.
    this.sync3DBins();
    if (this.routeActive && this.realRouteCoords.length) this.sync3DRoute();
  }

}