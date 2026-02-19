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

 
  public containerUpdates$ = new Subject<ContainerUpdate[]>();
  public connectionStatus$ = new Subject<'connected' | 'disconnected' | 'error'>();

  constructor() {
    this.initConnection();
  }



  private initConnection() {
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl('https://localhost:7277/hubs/containers', {
        skipNegotiation: false,
        transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.ServerSentEvents
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000])  
      .configureLogging(signalR.LogLevel.Information)
      .build();

   
    this.hubConnection.on('ContainersUpdated', (updates: ContainerUpdate[]) => {
      this.containerUpdates$.next(updates);
      
    });

    this.hubConnection.onclose(() => {
      this.connectionEstablished = false;
      this.connectionStatus$.next('disconnected');
      console.log(' SignalR disconnected');
    });

    this.hubConnection.onreconnecting(() => {
      console.log(' SignalR reconnecting...');
    });

    this.hubConnection.onreconnected(() => {
      this.connectionEstablished = true;
      this.connectionStatus$.next('connected');
      console.log(' SignalR reconnected');
    });

    this.hubConnection.on('connected', (message: string) => {
  console.log('Hub says:', message);
});
  }


  public async start(): Promise<void> {
    if (this.connectionEstablished) return;

    try {
      await this.hubConnection.start();
      this.connectionEstablished = true;
      this.connectionStatus$.next('connected');
      console.log(' SignalR connected');
    } catch (err) {
      this.connectionStatus$.next('error');
      console.error(' SignalR connection failed:', err);
      
      
      setTimeout(() => this.start(), 5000);
    }
  }

  public async stop(): Promise<void> {
    if (!this.connectionEstablished) return;

    try {
      await this.hubConnection.stop();
      this.connectionEstablished = false;
      this.connectionStatus$.next('disconnected');
      console.log(' SignalR stopped');
    } catch (err) {
      console.error('Error stopping SignalR:', err);
    }
  }

  public isConnected(): boolean {
    return this.connectionEstablished;
  }
}