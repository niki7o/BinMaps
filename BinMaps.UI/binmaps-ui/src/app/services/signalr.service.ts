import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ContainerSignalRService {

  private hub!: signalR.HubConnection;
  private _updates$ = new BehaviorSubject<any[]>([]);
  readonly containerUpdates$ = this._updates$.asObservable();

  start() {
    if (this.hub) return;

    this.hub = new signalR.HubConnectionBuilder()
      .withUrl('https://localhost:7277/hubs/containers', {
        skipNegotiation: true,
        transport: signalR.HttpTransportType.WebSockets
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    
    this.hub.on('Connected', (_connectionId: string) => {  });

    this.hub.on('ContainersUpdated', (updates: any[]) => {
      this._updates$.next(updates);
    });

    this.hub.onreconnecting(() => console.log('[SignalR] Reconnecting...'));
    this.hub.onreconnected(() => console.log('[SignalR] Reconnected.'));
    this.hub.onclose(() => console.log('[SignalR] Connection closed.'));

    this.hub
      .start()
      .then(() => console.log('[SignalR] Connected to ContainerHub'))
      .catch(err => console.error('[SignalR] Connection error:', err));
  }

  stop() { this.hub?.stop(); }
}