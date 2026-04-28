import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Subscription } from 'rxjs';
import { environment } from '../../environments/environment';

interface Zone {
  name: string;
  avgFill: number;
  risk: string;
  riskLabel: string;
  containerCount: number;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home.html',
  styleUrls: ['./home.css']
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  isLoggedIn = false;
  private authSub?: Subscription;
  private map?: L.Map;

  zones: Zone[] = [
    { name: 'Зона 1 — Надежда',    avgFill: 67, risk: 'high',     riskLabel: 'Високо',   containerCount: 42 },
    { name: 'Зона 2 — Център',      avgFill: 82, risk: 'critical', riskLabel: 'Критично', containerCount: 61 },
    { name: 'Зона 3 — Люлин',       avgFill: 54, risk: 'medium',   riskLabel: 'Умерено',  containerCount: 48 },
    { name: 'Зона 4 — Овча Купел', avgFill: 45, risk: 'medium',   riskLabel: 'Умерено',  containerCount: 33 },
    { name: 'Зона 5 — Витоша',      avgFill: 38, risk: 'low',      riskLabel: 'Ниско',    containerCount: 27 },
    { name: 'Зона 6 — Изток',       avgFill: 61, risk: 'medium',   riskLabel: 'Умерено',  containerCount: 35 }
  ];

  constructor(private router: Router, private authService: AuthService) {}

  ngOnInit(): void {
    this.authSub = this.authService.currentUser$.subscribe(user => {
      this.isLoggedIn = !!user;
    });
  }

  ngAfterViewInit(): void {
    try {
      this.map = L.map('hero-map', {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false
      }).setView(environment.region.center, environment.region.defaultZoom);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
    } catch (e) { /* map container may not exist on some routes */ }
  }

  ngOnDestroy(): void {
    this.authSub?.unsubscribe();
    this.map?.remove();
  }

  fillClass(fill: number): string {
    if (fill >= 80)
       return 'progress__fill--danger';
    if (fill >= 60)
       return 'progress__fill--warn';
    return 'progress__fill--ok';
  }

  riskBadge(risk: string): string {
    const map: { [key: string]: string } = {
      critical: 'badge--danger', high: 'badge--warn',
      medium: 'badge--blue', low: 'badge--eco'
    };
    return map[risk] || 'badge--default';
  }
}
