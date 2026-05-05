import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { Subscription } from 'rxjs';
import { environment } from '../../environments/environment';

interface Zone {
  name: string;
  areaId: string;
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
  heroTime = '––:––:––';
  private authSub?: Subscription;
  private map?: L.Map;
  private clockTimer?: ReturnType<typeof setInterval>;

  zones: Zone[] = [
    { name: 'Зона 1 — Надежда',   areaId: 'Зона 1 - Надежда север', avgFill: 67, risk: 'high',     riskLabel: 'Високо',   containerCount: 42 },
    { name: 'Зона 2 — Център',     areaId: 'Зона 2 - Център',        avgFill: 82, risk: 'critical', riskLabel: 'Критично', containerCount: 61 },
    { name: 'Зона 3 — Люлин',      areaId: 'Зона 3 - Люлин',         avgFill: 54, risk: 'medium',   riskLabel: 'Умерено',  containerCount: 48 },
    { name: 'Зона 4 — Овча Купел', areaId: 'Зона 4 - Овча Купел',    avgFill: 45, risk: 'medium',   riskLabel: 'Умерено',  containerCount: 33 },
    { name: 'Зона 5 — Витоша',     areaId: 'Зона 5 - Юг и Витоша',   avgFill: 38, risk: 'low',      riskLabel: 'Ниско',    containerCount: 27 },
    { name: 'Зона 6 — Изток',      areaId: 'Зона 6 - Изток',         avgFill: 61, risk: 'medium',   riskLabel: 'Умерено',  containerCount: 35 }
  ];


  get totalContainers(): number {
    return this.zones.reduce((sum, z) => sum + z.containerCount, 0);
  }

  get avgZoneFill(): number {
    const total = this.totalContainers;
    if (!total) return 0;
    const weighted = this.zones.reduce(
      (sum, z) => sum + z.avgFill * z.containerCount,
      0,
    );
    return Math.round(weighted / total);
  }

  constructor(
    private router: Router,
    private authService: AuthService,
    private http: HttpClient,
  ) {}

  ngOnInit(): void {
    this.authSub = this.authService.currentUser$.subscribe(user => {
      this.isLoggedIn = !!user;
    });

  
    this.loadContainerCounts();
  }

  private loadContainerCounts(): void {
    this.http
      .get<Array<{ id: number; areaId: string; fillPercentage: number }>>(`${environment.apiUrl}/containers`)
      .subscribe({
        next: containers => {
          if (!containers?.length) return;

          // Group by areaId — count per zone and compute avg fill.
          const countByArea = new Map<string, number>();
          const fillSumByArea = new Map<string, number>();

          for (const c of containers) {
            countByArea.set(c.areaId, (countByArea.get(c.areaId) ?? 0) + 1);
            fillSumByArea.set(c.areaId, (fillSumByArea.get(c.areaId) ?? 0) + c.fillPercentage);
          }

          this.zones = this.zones.map(z => {
            const count = countByArea.get(z.areaId);
            const fillSum = fillSumByArea.get(z.areaId);
            if (count === undefined) return z;
            return {
              ...z,
              containerCount: count,
              avgFill: count > 0 ? Math.round(fillSum! / count) : z.avgFill,
            };
          });
        },
        error: () => { /* keep static fallback counts if API is unreachable */ },
      });
  }

  private tickClock(): void {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    this.heroTime = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const el = document.getElementById('hero-clock');
    if (el) el.textContent = this.heroTime;
  }

  ngAfterViewInit(): void {
    this.tickClock();
    this.clockTimer = setInterval(() => this.tickClock(), 1000);

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
    if (this.clockTimer) clearInterval(this.clockTimer);
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
