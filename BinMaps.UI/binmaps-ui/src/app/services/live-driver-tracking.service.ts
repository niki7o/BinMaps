import { Injectable, OnDestroy, computed, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import {
  ContainerSignalRService,
  DriverPositionEvent,
} from './signalr.service';

/** Public model — one row per active driver, exposed via the
 *  `liveDrivers` signal. Carries everything map and admin views need. */
export interface LiveDriver {
  driverId:    string;
  driverName:  string;
  runId:       number;
  areaId:      string;
  /** Last position the server told us about. Always present once we've had
   *  any update; for snapshot-only entries (server restarted, driver hasn't
   *  broadcast yet) `lastPosition` from the snapshot endpoint may be null,
   *  and we keep the row hidden until the first telemetry tick. */
  lat:         number;
  lng:         number;
  heading:     number;
  speedKmh:    number;
  stopIndex:   number;
  totalStops:  number;
  load:        number;
  phase:       'start' | 'move' | 'stop' | 'end';
  /** UTC ISO of the last position update. */
  at:          string;
  /** Truck plate + capacity if the driver started the run with a truck
   *  assigned. Null when the run has no truck (some flows allow that). */
  truck: { id: number; plate: string; capacity: number } | null;
  /** Deterministic per-driver colour. Computed once on first sighting and
   *  preserved across updates so a driver's marker doesn't flicker through
   *  the palette as positions arrive. */
  color: string;
  /** False when the driver is active but hasn't broadcast a GPS position
   *  yet (just started, or server restarted). Map markers should only be
   *  placed when this is true; the admin panel can show a "no GPS" badge. */
  hasGps: boolean;
}

interface ActiveRunDto {
  runId:        number;
  driverId:     string;
  driverName:   string;
  areaId:       string;
  trashType:    number;
  startedAt:    string;
  truck: { id: number; plate: string; capacity: number } | null;
  lastPosition: {
    lat: number; lng: number; heading: number; speedKmh: number;
    stopIndex: number; totalStops: number;
    load: number; phase: 'start' | 'move' | 'stop' | 'end';
    at: string;
  } | null;
}

/**
 * Singleton state for "every driver currently on a route". Two inputs:
 *
 *   1. SignalR `DriverPosition` events — primary, push-based stream.
 *   2. `GET /api/trucks/route/active` snapshot — used on init and every time
 *      the tab becomes visible again, so a long backgrounding doesn't leave
 *      the map showing stale (or missing) trucks.
 *
 * The service is signal-based so map / admin / sidebar components can all
 * subscribe via `liveDrivers()` without each maintaining their own copy.
 */
@Injectable({ providedIn: 'root' })
export class LiveDriverTrackingService implements OnDestroy {
  private readonly _drivers = signal<Map<string, LiveDriver>>(new Map());

  /** Read-only view: array of currently active drivers, ordered by name. */
  readonly liveDrivers = computed(() => {
    const list = Array.from(this._drivers().values());
    list.sort((a, b) => a.driverName.localeCompare(b.driverName));
    return list;
  });

  /** Map keyed by driverId for fast lookup. */
  readonly liveDriversById = computed(() => this._drivers());

  /** Count is convenient for navbar/header badges later. */
  readonly activeCount = computed(() => this._drivers().size);

  private positionSub?: Subscription;
  private visibilityHandler?: () => void;
  private readonly API = `${window.location.origin}${environment.apiUrl}`;

  constructor(
    private readonly signalR: ContainerSignalRService,
    private readonly auth: AuthService,
    private readonly http: HttpClient,
  ) {
    // 1. Push stream — the high-frequency truth.
    this.positionSub = this.signalR.driverPositions$.subscribe(ev => {
      this.applyPositionEvent(ev);
    });

    // 2. Initial pull — covers everything in flight before we connected.
    this.refreshFromServer();

    // 3. Tab-visibility re-sync. RequestAnimationFrame is throttled to ~1Hz
    //    when the tab is hidden, and SignalR may have been silently dropped
    //    by the OS. When the user comes back, we pull the snapshot once and
    //    the driver markers jump to truth — production tools (Uber,
    //    Doordash) behave this way and it feels right.
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        this.refreshFromServer();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  ngOnDestroy(): void {
    this.positionSub?.unsubscribe();
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  /** Force a snapshot pull. Useful from components that just opened a view
   *  that depends on this state. */
  refreshFromServer(): void {
    const token = this.auth.getToken();
    if (!token) return; // unauth'd — snapshot endpoint requires login
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });

    this.http.get<ActiveRunDto[]>(`${this.API}/trucks/route/active`, { headers })
      .subscribe({
        next: rows => this.applySnapshot(rows ?? []),
        error: () => { /* swallow — keep whatever live data we already have */ },
      });
  }

  /** Whether a route on (areaId, trashType) is currently held by another driver.
   *  Used by the start-route UI to short-circuit the API call and show a clear
   *  message. The backend also enforces this (409); this is just a friendlier
   *  pre-check. */
  isRouteHeldByAnother(
    areaId: string,
    excludeDriverId: string | null,
  ): LiveDriver | null {
    for (const d of this._drivers().values()) {
      if (d.areaId !== areaId) continue;
      if (excludeDriverId && d.driverId === excludeDriverId) continue;
      return d;
    }
    return null;
  }

  // ── Internal: state mutators ───────────────────────────────────────

  private applyPositionEvent(ev: DriverPositionEvent): void {
    const next = new Map(this._drivers());

    if (ev.phase === 'end') {
      next.delete(ev.driverId);
      this._drivers.set(next);
      return;
    }

    const prev = next.get(ev.driverId);
    next.set(ev.driverId, {
      driverId:   ev.driverId,
      driverName: ev.driverName,
      runId:      ev.runId,
      areaId:     ev.areaId,
      lat:        ev.lat,
      lng:        ev.lng,
      heading:    ev.heading,
      speedKmh:   ev.speedKmh,
      stopIndex:  ev.stopIndex,
      totalStops: ev.totalStops,
      load:       ev.load,
      phase:      ev.phase,
      at:         ev.at,
      // Preserve the truck info from the snapshot; SignalR events don't
      // carry it because plates/capacity don't change mid-route.
      truck:      prev?.truck ?? null,
      color:      prev?.color ?? colorForDriver(ev.driverId),
      hasGps:     true,
    });

    this._drivers.set(next);
  }

  private applySnapshot(rows: ActiveRunDto[]): void {
    const next = new Map<string, LiveDriver>();
    const prev = this._drivers();

    for (const r of rows) {
      const existing = prev.get(r.driverId);

      if (!r.lastPosition) {
        // Server has no cached position yet (driver just started, or the
        // in-memory tracker was cleared by a server restart).
        //   a) We already have live GPS data from a SignalR event — keep it
        //      so a tab-visibility refresh doesn't wipe a marker the user
        //      can already see. Update mutable fields in case they changed.
        //   b) We have no data at all — still add a row with hasGps:false so
        //      the admin panel and live fleet list can show the driver is
        //      active, with a "GPS не е наличен" indicator. The map marker
        //      won't be rendered until the first DriverPosition tick.
        if (existing) {
          next.set(r.driverId, {
            ...existing,
            driverName: r.driverName,
            runId:      r.runId,
            areaId:     r.areaId,
            truck:      r.truck,
          });
        } else {
          next.set(r.driverId, {
            driverId:   r.driverId,
            driverName: r.driverName,
            runId:      r.runId,
            areaId:     r.areaId,
            lat:        0,
            lng:        0,
            heading:    0,
            speedKmh:   0,
            stopIndex:  0,
            totalStops: 0,
            load:       0,
            phase:      'start',
            at:         new Date().toISOString(),
            truck:      r.truck,
            color:      colorForDriver(r.driverId),
            hasGps:     false,
          });
        }
        continue;
      }

      next.set(r.driverId, {
        driverId:   r.driverId,
        driverName: r.driverName,
        runId:      r.runId,
        areaId:     r.areaId,
        lat:        r.lastPosition.lat,
        lng:        r.lastPosition.lng,
        heading:    r.lastPosition.heading,
        speedKmh:   r.lastPosition.speedKmh,
        stopIndex:  r.lastPosition.stopIndex,
        totalStops: r.lastPosition.totalStops,
        load:       r.lastPosition.load,
        phase:      r.lastPosition.phase,
        at:         r.lastPosition.at,
        truck:      r.truck,
        color:      existing?.color ?? colorForDriver(r.driverId),
        hasGps:     true,
      });
    }

    // Snapshot is authoritative for the *active* set, so anyone not in
    // `rows` is genuinely no longer running — drop them from the map.
    this._drivers.set(next);
  }
}

/**
 * Deterministic colour from a driverId. Same driver always gets the same
 * colour so trucks don't flicker as updates arrive, and we don't need to
 * maintain a global palette / counter. 12 distinct hues keep contrast
 * against the dark map theme.
 */
function colorForDriver(driverId: string): string {
  const palette = [
    '#10b981', // eco green
    '#3b82f6', // tech blue
    '#06b6d4', // cyan
    '#f59e0b', // amber
    '#ef4444', // red
    '#a855f7', // purple
    '#ec4899', // pink
    '#14b8a6', // teal
    '#f97316', // orange
    '#84cc16', // lime
    '#6366f1', // indigo
    '#fbbf24', // yellow
  ];
  let hash = 0;
  for (let i = 0; i < driverId.length; i++) {
    hash = (hash * 31 + driverId.charCodeAt(i)) | 0;
  }
  return palette[Math.abs(hash) % palette.length];
}
