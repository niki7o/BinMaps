import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject, Subject } from 'rxjs';
import { environment } from '../../environments/environment';
import { NotificationService } from './notification.service';
import { AuthService } from './auth.service';

export interface ContainerUpdate {
  id: number;
  fillPercentage: number;
  temperature: number | null;
  batteryPercentage: number | null;
  hasSensor: boolean;
  status: number | null;
}

export interface TruckProblemEvent {
  reportId: number;
  containerId: number | null;
  reporter: string;
  description: string;
  createdAt:string;
}

export interface ReportCreatedEvent {
  reportId:number;
  containerId:number | null;
  reportType:string;
  userName:string;
  createdAt: string;
}

export interface ReportStatusChangedEvent {
  reportId: number;
  containerId:number | null;
  isApproved:boolean;
  userId: string;
  reportType: string;
}

export interface ReputationIncreasedEvent {
  userId: string;
  userName: string;
  newReputation:number;
}

/** Telemetry emitted by a driver's client while they are on an active route.
 *  Admins receive these via the `DriverPosition` hub event. */
export interface DriverPositionEvent {
  driverId:   string;
  driverName: string;
  runId:      number;
  areaId:     string;
  lat:        number;
  lng:        number;
  heading:    number;   // degrees, 0 = north
  speedKmh:   number;
  stopIndex:  number;
  totalStops: number;
  load:       number;
  phase:      'start' | 'move' | 'stop' | 'end';
  at:         string;   // ISO UTC
}

/** Payload the driver sends via the `DriverPosition` hub method. */
export interface DriverPositionPayload {
  runId:      number;
  areaId:     string;
  lat:        number;
  lng:        number;
  heading:    number;
  speedKmh:   number;
  stopIndex:  number;
  totalStops: number;
  load:       number;
  phase:      'start' | 'move' | 'stop' | 'end';
}

@Injectable({ providedIn: 'root' })
export class ContainerSignalRService {

  private static readonly RECONNECT_MS = [0, 2000, 5000, 10000, 30000] as const;

  private hub!: signalR.HubConnection;
  private intentionalStop = false;
  /** Promise resolved once the initial start() settles. Used by stop() so we
   *  never tear down a half-built connection (which produces the noisy
   *  "Failed to start the HttpConnection before stop() was called" error). */
  private startPromise: Promise<void> | null = null;

  private readonly _updates$ = new BehaviorSubject<ContainerUpdate[]>([]);
  private readonly _truckProblems$ = new Subject<TruckProblemEvent>();
  private readonly _removed$ = new Subject<number>();
  private readonly _added$ = new Subject<any>();
  private readonly _driverPositions$ = new Subject<DriverPositionEvent>();

  readonly containerUpdates$ = this._updates$.asObservable();
  readonly truckProblems$  = this._truckProblems$.asObservable();
  readonly containerRemoved$ = this._removed$.asObservable();
  readonly containerAdded$ = this._added$.asObservable();
  /** Admins receive a stream of driver telemetry. Others get nothing. */
  readonly driverPositions$ = this._driverPositions$.asObservable();

  private readonly _seenFires = new Set<number>();

  constructor(
    private readonly notifService: NotificationService,
    private readonly auth: AuthService
  ) {}

  start(): void {
    if (this.hub) return;

    if (!this.auth.getToken()) {
      console.warn('SignalR start skipped — no auth token available.');
      return;
    }

    this.intentionalStop = false;
    this.hub = this.buildHub();
    this.registerHandlers();

    this.hub.onclose(async () => {
      if (this.intentionalStop) {
        console.log('SignalR closed (intentional stop).');
        return;
      }
      console.warn('SignalR disconnected. Reconnecting...');
      await this.reconnectLoop();
    });

    this.startPromise = this.hub.start()
      .catch(err => {
        // Race: stop() was called before start() finished.
        // SignalR rejects with "Failed to start the HttpConnection before stop() was called".
        // Don't log it as an error — it's a normal lifecycle event.
        if (this.intentionalStop) return;
        console.error('SignalR start error', err);
        this.reconnectLoop();
      })
      .finally(() => {
        this.startPromise = null;
      });
  }

  private async reconnectLoop(): Promise<void> {
    let attempts = 0;
    while (attempts < 10) {
      if (this.intentionalStop) return;
      if (!this.auth.getToken()) {
        console.warn('SignalR reconnect aborted — no auth token.');
        return;
      }
      try {
        await new Promise(r => setTimeout(r, 3000));
        if (this.intentionalStop) return;
        await this.hub.start();
        console.log('SignalR reconnected');
        return;
      } catch {
        attempts++;
      }
    }
  }

  async stop(): Promise<void> {
    this.intentionalStop = true;
    if (this.startPromise) {
      try { await this.startPromise; } catch { /* swallow */ }
    }
    try { await this.hub?.stop(); } catch { /* swallow */ }
  }

  
  sendDriverPosition(payload: DriverPositionPayload): void {
    if (!this.hub || this.hub.state !== signalR.HubConnectionState.Connected) return;
    this.hub.invoke('DriverPosition', payload).catch(() => {});
  }

  private buildHub(): signalR.HubConnection {
    const fullHubUrl = `${window.location.origin}${environment.hubUrl}`;
    return new signalR.HubConnectionBuilder()
      .withUrl(fullHubUrl, {
        accessTokenFactory: () => this.auth.getToken() ?? '',
        transport:
          signalR.HttpTransportType.WebSockets |
          signalR.HttpTransportType.LongPolling
      })
      .withAutomaticReconnect([...ContainerSignalRService.RECONNECT_MS])
      .configureLogging(signalR.LogLevel.Warning)
      .build();
  }

  private registerHandlers(): void {

    this.hub.on('ContainersUpdated', (updates: ContainerUpdate[]) => {
      this._updates$.next(updates);

      updates.forEach(u => {
        const isOnFire = u.status === 2;

        if (isOnFire && !this._seenFires.has(u.id)) {
  
          this._seenFires.add(u.id);
          this.notifService.push({
            type:        'fire',
            severity:    'critical',
            iconType:    'danger',
            title:       '🔥 Пожарна опасност',
            description: `Контейнер #${u.id} е в пожар`,
            timeAgo:     'Сега',
            filter:      'critical',
            forRoles:    ['User', 'Admin', 'Driver'],
            containerId: u.id,
            actionUrl:   `/map?bin=${u.id}`
          });
        }

        if (!isOnFire) {
          this._seenFires.delete(u.id);
        }
      });
    });

    this.hub.on('ContainerRemoved', (ev: { id: number }) => {
      if (ev?.id != null) this._removed$.next(ev.id);
    });

    this.hub.on('ContainerAdded', (payload: any) => {
      if (payload?.id != null) this._added$.next(payload);
    });

    this.hub.on('TruckProblemReported', (ev: TruckProblemEvent) => {
      this._truckProblems$.next(ev);
      this.notifService.push({
        type:        'report',
        severity:    'warning',
        iconType:    'warn',
        title:       '🚛 Проблем с камион',
        description: ev.description || `Докладван от ${ev.reporter}`,
        timeAgo:     'Сега',
        filter:      'reports',
        forRoles:    ['Driver', 'Admin'],
        containerId: ev.containerId ?? undefined,
        actionUrl:   ev.containerId ? `/map?bin=${ev.containerId}` : undefined
      });
    });

    this.hub.on('ReportCreated', (ev: ReportCreatedEvent) => {
      const typeLabel: Record<string, string> = {
        Full:'Пълен',
        Fire:'Пожар',
        SensorBroken: 'Счупен сензор',
        ContainerDamage:'Повреден контейнер',
        TruckProblem:'Проблем с камион'
      };
      const label = typeLabel[ev.reportType] ?? ev.reportType;
      this.notifService.push({
        type: 'report',
        severity:'info',
        iconType: 'blue',
        title: '📋 Нов доклад за преглед',
        description:`${ev.userName} докладва: ${label}${ev.containerId ? ` (Контейнер #${ev.containerId})` : ''}`,
        timeAgo: 'Сега',
        filter: 'reports',
        forRoles: ['Admin'],
        containerId: ev.containerId ?? undefined,
        actionUrl: ev.containerId ? `/map?bin=${ev.containerId}` : undefined
      });
    });

    this.hub.on('ReportStatusChanged', (ev: ReportStatusChangedEvent) => {
      if (ev.isApproved) {
        this.notifService.push({
          type: 'report',
          severity:'info',
          iconType: 'eco',
          title:'✅ Докладът е одобрен',
          description:`Вашият доклад е одобрен${ev.containerId ? ` за Контейнер #${ev.containerId}` : ''}`,
          timeAgo: 'Сега',
          filter: 'reports',
          forRoles:['User'],
          targetUserId: ev.userId,
          containerId:  ev.containerId ?? undefined,
          actionUrl:    ev.containerId ? `/map?bin=${ev.containerId}` : undefined
        });
      } else {
        this.notifService.push({
          type:'report',
          severity:'warning',
          iconType:'warn',
          title:'❌ Докладът е отхвърлен',
          description:`Вашият доклад е отхвърлен${ev.containerId ? ` за Контейнер #${ev.containerId}` : ''}`,
          timeAgo: 'Сега',
          filter:'reports',
          forRoles:['User'],
          targetUserId: ev.userId,
          containerId:  ev.containerId ?? undefined,
          actionUrl:ev.containerId ? `/map?bin=${ev.containerId}` : undefined
        });
      }
    });

    this.hub.on('ReputationIncreased', (ev: ReputationIncreasedEvent) => {
      this.notifService.push({
        type: 'route',
        severity: 'info',
        iconType: 'eco',
        title: '⭐ Репутацията ви нарасна',
        description:`Вашата репутация е вече ${ev.newReputation} точки`,
        timeAgo:'Сега',
        filter: 'all',
        forRoles: ['User'],
        targetUserId: ev.userId
      });
    });

    this.hub.on('DriverPosition', (ev: DriverPositionEvent) => {
      this._driverPositions$.next(ev);
    });

    this.hub.on('AdminNotification', (items: any[]) => {
      items.forEach((n: any) => {
        if (n.type === 'battery_low') {
          this.notifService.push({
            type:        'report',
            severity:    'warning',
            iconType:    'warn',
            title:       '🔋 Ниска батерия',
            description: n.message,
            timeAgo:     'Сега',
            filter:      'critical',
            forRoles:    ['Admin'],
            containerId: n.containerId,
            actionUrl:   `/map?bin=${n.containerId}`
          });
        } else if (n.type === 'battery_dead') {
          this.notifService.push({
            type:        'report',
            severity:    'critical',
            iconType:    'danger',
            title:       '🔋 Сензорът е деактивиран',
            description: n.message,
            timeAgo:     'Сега',
            filter:      'critical',
            forRoles:    ['Admin'],
            containerId: n.containerId,
            actionUrl:   `/map?bin=${n.containerId}`
          });
        }
      });
    });
  }
}
