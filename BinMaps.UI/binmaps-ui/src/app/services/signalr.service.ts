import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject, Subject } from 'rxjs';
import { environment } from '../../environments/environment';
import { NotificationService } from './notification.service';

export interface ContainerUpdate {
  id:                number;
  fillPercentage:    number;
  temperature:       number | null;
  batteryPercentage: number | null;
  status:            number | null;
}

export interface TruckProblemEvent {
  reportId:    number;
  containerId: number | null;
  reporter:    string;
  description: string;
  createdAt:   string;
}

@Injectable({ providedIn: 'root' })
export class ContainerSignalRService {

  
  private static readonly RECONNECT_MS = [0, 2000, 5000, 10000, 30000] as const;

  private hub!: signalR.HubConnection;

  private readonly _updates$      = new BehaviorSubject<ContainerUpdate[]>([]);
  private readonly _truckProblems$ = new Subject<TruckProblemEvent>();

  readonly containerUpdates$  = this._updates$.asObservable();
  readonly truckProblems$     = this._truckProblems$.asObservable();

  constructor(private readonly notifService: NotificationService) {}

  start(): void {
  if (this.hub) return;

  this.hub = this.buildHub();
  this.registerHandlers();

  this.hub.onclose(async () => {
    console.warn('SignalR disconnected. Reconnecting...');

    await this.reconnectLoop();
  });

  this.hub.start().catch(err => {
    console.error('SignalR start error', err);
    this.reconnectLoop();
  });
}


private async reconnectLoop(): Promise<void> {
  let attempts = 0;

  while (attempts < 10) {
    try {
      await new Promise(r => setTimeout(r, 3000));
      await this.hub.start();
      console.log('SignalR reconnected');
      return;
    } catch {
      attempts++;
    }
  }
}

  stop(): void { this.hub?.stop(); }

 private buildHub(): signalR.HubConnection {
  const fullHubUrl = `${window.location.origin}${environment.hubUrl}`;
  return new signalR.HubConnectionBuilder()
    .withUrl(fullHubUrl, {
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
        if (u.status === 2) {
          this.notifService.push({
            type:        'fire',
            severity:    'critical',
            iconType:    'danger',
            title:       'Пожарна опасност',
            description: `Контейнер #${u.id} е в пожар`,
            timeAgo:     'Сега',
            filter:      'critical',
            forRoles:    ['User', 'Admin', 'Driver']
          });
        }
      });
    });

    this.hub.on('TruckProblemReported', (ev: TruckProblemEvent) => {
      this._truckProblems$.next(ev);
      this.notifService.push({
        type:        'report',
        severity:    'warning',
        iconType:    'warn',
        title:       'Проблем с камион',
        description: ev.description || `Докладван от ${ev.reporter}`,
        timeAgo:     'Сега',
        filter:      'reports',
        forRoles:    ['Driver', 'Admin']
      });
    });
  }
}
