import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';

export interface ContainerUpdate {
  id: number;
  areaId: string;
  fillPercentage: number;
  temperature: number | null;
  status: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class ContainerSignalRService {

  private hubConnection!: signalR.HubConnection;
  private connectionEstablished = false;

  // Observable stream за updates
  public containerUpdates$ = new Subject<ContainerUpdate[]>();
  public connectionStatus$ = new Subject<'connected' | 'disconnected' | 'error'>();

  constructor() {
    this.initConnection();
  }

  // ═══════════════════════════════════════
  // INITIALIZE CONNECTION
  // ═══════════════════════════════════════

  private initConnection() {
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl('https://localhost:7277/hubs/containers', {
        skipNegotiation: false,
        transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.ServerSentEvents
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000])  // retry delays
      .configureLogging(signalR.LogLevel.Information)
      .build();

    // ── Event handlers ──
    this.hubConnection.on('ContainersUpdated', (updates: ContainerUpdate[]) => {
      this.containerUpdates$.next(updates);
      console.log(`📡 Received ${updates.length} container updates`);
    });

    this.hubConnection.onclose(() => {
      this.connectionEstablished = false;
      this.connectionStatus$.next('disconnected');
      console.log('❌ SignalR disconnected');
    });

    this.hubConnection.onreconnecting(() => {
      console.log('🔄 SignalR reconnecting...');
    });

    this.hubConnection.onreconnected(() => {
      this.connectionEstablished = true;
      this.connectionStatus$.next('connected');
      console.log('✅ SignalR reconnected');
    });
  }

  // ═══════════════════════════════════════
  // START / STOP
  // ═══════════════════════════════════════

  public async start(): Promise<void> {
    if (this.connectionEstablished) return;

    try {
      await this.hubConnection.start();
      this.connectionEstablished = true;
      this.connectionStatus$.next('connected');
      console.log('✅ SignalR connected');
    } catch (err) {
      this.connectionStatus$.next('error');
      console.error('❌ SignalR connection failed:', err);
      
      // Retry after 5 seconds
      setTimeout(() => this.start(), 5000);
    }
  }

  public async stop(): Promise<void> {
    if (!this.connectionEstablished) return;

    try {
      await this.hubConnection.stop();
      this.connectionEstablished = false;
      this.connectionStatus$.next('disconnected');
      console.log('⏹ SignalR stopped');
    } catch (err) {
      console.error('Error stopping SignalR:', err);
    }
  }

  public isConnected(): boolean {
    return this.connectionEstablished;
  }
}