import { Injectable, OnDestroy, computed, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import {
  ContainerSignalRService,
  DriverPositionEvent,
} from './signalr.service';

export interface LiveDriver {
  driverId:    string;
  driverName:  string;
  runId:       number;
  areaId:      string;

  lat:         number;
  lng:         number;
  heading:     number;
  speedKmh:    number;
  stopIndex:   number;
  totalStops:  number;
  load:        number;
  phase:       'start' | 'move' | 'stop' | 'end';
  
  at:          string;
  
  truck: { id: number; plate: string; capacity: number } | null;
  
  color: string;
  
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


@Injectable({ providedIn: 'root' })
export class LiveDriverTrackingService implements OnDestroy {
  private readonly _drivers = signal<Map<string, LiveDriver>>(new Map());

  readonly liveDrivers = computed(() => {
    const list = Array.from(this._drivers().values());
    list.sort((a, b) => a.driverName.localeCompare(b.driverName));
    return list;
  });

  
  readonly liveDriversById = computed(() => this._drivers());

 
  readonly activeCount = computed(() => this._drivers().size);

  private positionSub?: Subscription;
  private visibilityHandler?: () => void;
  private readonly API = `${window.location.origin}${environment.apiUrl}`;

  constructor(
    private readonly signalR: ContainerSignalRService,
    private readonly auth: AuthService,
    private readonly http: HttpClient,
  ) {
   
    this.positionSub = this.signalR.driverPositions$.subscribe(ev => {
      this.applyPositionEvent(ev);
    });

    
    this.refreshFromServer();

    
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

  refreshFromServer(): void {
    const token = this.auth.getToken();
    if (!token) return; 
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });

    this.http.get<ActiveRunDto[]>(`${this.API}/trucks/route/active`, { headers })
      .subscribe({
        next: rows => this.applySnapshot(rows ?? []),
        error: () => { /* swallow — keep whatever live data we already have */ },
      });
  }

  
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

    this._drivers.set(next);
  }
}

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
