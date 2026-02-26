import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import L from 'leaflet';

interface TickerItem {
  text: string;
  color: string;
}

interface Zone {
  name: string;
  avgFill: number;
  critical: number;
  risk: string;
  riskLabel: string;
}

interface Stat {
  number: string;
  label: string;
}

interface Feature {
  icon: string;
  title: string;
  description: string;
}

interface HowItWorksStep {
  step: number;
  title: string;
  description: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.html',
  styleUrls: ['./home.css']
})
export class HomeComponent {
  isLoggedIn = false;
  currentYear = new Date().getFullYear();
  private map!: L.Map;

  tickerItems: TickerItem[] = [
    { text: '🌍 246 активни контейнери', color: 'green' },
    { text: '📊 Real-time мониторинг', color: 'blue' },
    { text: '🚛 Оптимизирани маршрути', color: 'cyan' },
    { text: '♻️ Smart IoT сензори', color: 'green' },
    { text: '🔥 Превенция на пожари', color: 'red' },
    { text: '📱 Гражданско участие', color: 'purple' }
  ];

  stats: Stat[] = [
    { number: '246', label: 'Контейнери' },
    { number: '6', label: 'Зони' },
    { number: '92%', label: 'IoT покритие' },
    { number: '24/7', label: 'Мониторинг' }
  ];

  features: Feature[] = [
    { icon: 'map', title: 'Real-time карта', description: 'Интерактивна карта с live данни за всички контейнери в града' },
    { icon: 'ai', title: 'AI анализ', description: 'Машинно самообучение за прогнозиране и оптимизация' },
    { icon: 'route', title: 'Smart маршрути', description: 'Автоматично генериране на оптимални маршрути за камионите' },
    { icon: 'sensor', title: 'IoT сензори', description: 'Автоматично измерване на запълване и температура' },
    { icon: 'report', title: 'Гражданско участие', description: 'Репортване на проблеми директно от жителите' },
    { icon: 'dashboard', title: 'Analytics', description: 'Детайлни статистики и визуализации на данните' }
  ];

  howItWorks: HowItWorksStep[] = [
    { step: 1, title: 'Събиране на данни', description: 'IoT сензорите в контейнерите измерват запълване и температура на всеки 10 минути' },
    { step: 2, title: 'AI анализ', description: 'Алгоритмите анализират данните и прогнозират кога ще се запълнят контейнерите' },
    { step: 3, title: 'Оптимизация', description: 'Системата генерира оптимални маршрути използвайки TSP алгоритъм' },
    { step: 4, title: 'Изпълнение', description: 'Камионите следват маршрута с real-time навигация и автоматично изпразване' }
  ];

  zones: Zone[] = [
    { name: 'Зона 1 - Надежда север', avgFill: 67, critical: 12, risk: 'high', riskLabel: 'Високо' },
    { name: 'Зона 2 - Център', avgFill: 82, critical: 18, risk: 'critical', riskLabel: 'Критично' },
    { name: 'Зона 3 - Люлин', avgFill: 54, critical: 8, risk: 'medium', riskLabel: 'Умерено' },
    { name: 'Зона 4 - Овча Купел', avgFill: 45, critical: 5, risk: 'medium', riskLabel: 'Умерено' },
    { name: 'Зона 5 - Юг и Витоша', avgFill: 38, critical: 3, risk: 'low', riskLabel: 'Ниско' },
    { name: 'Зона 6 - Изток', avgFill: 61, critical: 9, risk: 'medium', riskLabel: 'Умерено' }
  ];

  constructor(
    private router: Router,
    private authService: AuthService
  ) {
    this.authService.currentUser$.subscribe(user => {
      this.isLoggedIn = !!user;
    });
  }

  ngAfterViewInit(): void {
    this.map = L.map('hero-map', {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      
      touchZoom: false
    }).setView([42.6977, 23.3219], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
  }

  navigateToMap() {
    this.router.navigate(['/map']);
  }

  navigateToRegister() {
    this.router.navigate(['/register']);
  }

  fillClass(fill: number): string {
    if (fill >= 80) return 'progress__fill--danger';
    if (fill >= 60) return 'progress__fill--warn';
    return 'progress__fill--ok';
  }

  riskBadge(risk: string): string {
    const map: { [key: string]: string } = {
      'critical': 'badge--danger',
      'high': 'badge--warn',
      'medium': 'badge--blue',
      'low': 'badge--eco'
    };
    return map[risk] || 'badge--default';
  }
}