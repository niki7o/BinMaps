import { Injectable, inject } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import * as signalR from '@microsoft/signalr';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ContainerSignalRService {
  private auth = inject(AuthService);

  private hub?: signalR.HubConnection;
  private _updates$ = new Subject<any[]>();

  readonly containerUpdates$: Observable<any[]> = this._updates$.asObservable();

  start(): void {
    if (this.hub) return;

    this.hub = new signalR.HubConnectionBuilder()
      .withUrl('https://localhost:7277/hubs/containers', {
        accessTokenFactory: () => this.auth.getToken() ?? ''
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    this.hub.on('ContainersUpdated', (updates: any[]) => {
      this._updates$.next(updates);
    });

    this.hub.on('ContainerUpdated', (update: any) => {
      this._updates$.next([update]);
    });

    this.hub.start().catch(err => console.error('SignalR start error:', err));
  }

  stop(): void {
    this.hub?.stop();
    this.hub = undefined;
  }
}