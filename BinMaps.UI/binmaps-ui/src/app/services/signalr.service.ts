import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject } from 'rxjs';
import { ContainerUpdate } from '../services/container.models';

@Injectable({ providedIn: 'root' })
export class ContainerSignalRService {

  
  private static readonly HUB_URL      = 'https://localhost:7277/hubs/containers';
  private static readonly RECONNECT_MS = [0, 2000, 5000, 10000, 30000] as const;
 
  private hub!: signalR.HubConnection;

  private readonly _updates$ = new BehaviorSubject<ContainerUpdate[]>([]);
  readonly containerUpdates$ = this._updates$.asObservable();
  
  start(): void {
    if (this.hub) return;
    this.hub = this.buildHub();
    this.registerHandlers();
    this.hub.start().catch(console.error);
  }

  stop(): void { this.hub?.stop(); }
  
  private buildHub(): signalR.HubConnection {
    return new signalR.HubConnectionBuilder()
      .withUrl(ContainerSignalRService.HUB_URL, {
        skipNegotiation: true,
        transport:       signalR.HttpTransportType.WebSockets
      })
      .withAutomaticReconnect([...ContainerSignalRService.RECONNECT_MS])
      .configureLogging(signalR.LogLevel.Warning)
      .build();
  }

  private registerHandlers(): void {
    this.hub.on('Connected',          (_: string)                => {});
    this.hub.on('ContainersUpdated',  (u: ContainerUpdate[])     => this._updates$.next(u));
  }
  
}