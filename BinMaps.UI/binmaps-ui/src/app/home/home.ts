import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

interface StatsResponse {
  totalContainers: number;
  totalTrucks: number;
  criticalContainers: number;
  sensorCoverage: number;
}

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: './home.html',
  styleUrls: ['./home.css'],
  imports: [CommonModule]
})
export class HomeComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  private readonly API_URL = 'https://localhost:7277/api';

  currentYear = new Date().getFullYear();
  isLoggedIn = false;

  
  stats = [
    { number: '—', label: 'Контейнери' },
    { number: '—', label: 'Камиона' },
    { number: '—', label: 'Критични' },
    { number: '—', label: 'Покритие' }
  ];

  features = [
    {
      icon: 'map',
      title: 'Карта в реално време',
      description: 'Визуализирай всички контейнери в София със статус на запълването и местоположението им в реално време.'
    },
    {
      icon: 'report',
      title: 'Граждански доклади',
      description: 'Докладвай за препълнени или повредени контейнери с AI анализ на снимки.'
    },
    {
      icon: 'ai',
      title: 'AI интелигентност',
      description: 'Автоматичен анализ на репорти със снимки и интелигентна верификация на състоянието.'
    },
    {
      icon: 'route',
      title: 'Оптимални маршрути',
      description: 'Алгоритми за най-ефективни маршрути на камионите базирани на TSP и приоритет.'
    },
    {
      icon: 'sensor',
      title: 'IoT сензори',
      description: 'Мониторинг на запълване, температура и статус на всеки контейнер чрез сензори.'
    },
    {
      icon: 'dashboard',
      title: 'Analytics Dashboard',
      description: 'Визуализация на данни, hotspot карти и прогнозиране на натовареността.'
    }
  ];

  howItWorks = [
    {
      step: '1',
      title: 'Мониторинг',
      description: 'IoT сензорите и граждански репорти събират данни за състоянието на контейнерите.'
    },
    {
      step: '2',
      title: 'AI Анализ',
      description: 'Системата анализира данните и определя приоритет за обслужване на всеки контейнер.'
    },
    {
      step: '3',
      title: 'Оптимизация',
      description: 'TSP алгоритъмът изчислява най-ефективните маршрути за камионите по зони.'
    },
    {
      step: '4',
      title: 'Изпълнение',
      description: 'Шофьорите получават инструкции и обслужват контейнерите по оптималния маршрут.'
    }
  ];

  ngOnInit() {
    this.checkLoginStatus();
    this.loadRealStats();
  }

  checkLoginStatus() {
    const userData = localStorage.getItem('user');
    this.isLoggedIn = !!userData;
  }

 
  loadRealStats() {
    this.http.get<any[]>(`${this.API_URL}/containers`).subscribe({
      next: (containers) => {
        const totalContainers = containers.length;
        const criticalContainers = containers.filter(c => c.fillPercentage > 80).length;
        const withSensors = containers.filter(c => c.hasSensor).length;
        const sensorCoverage = totalContainers > 0 
          ? Math.round((withSensors / totalContainers) * 100) 
          : 0;

        this.stats = [
          { number: `${totalContainers}`, label: 'Контейнери' },
          { number: '6', label: 'Камиона' }, // От seed data
          { number: `${criticalContainers}`, label: 'Критични' },
          { number: `${sensorCoverage}%`, label: 'Покритие' }
        ];
      },
      error: (err) => {
        console.error('Failed to load stats:', err);
       
        this.stats = [
          { number: '246', label: 'Контейнери' },
          { number: '6', label: 'Камиона' },
          { number: '—', label: 'Критични' },
          { number: '—', label: 'Покритие' }
        ];
      }
    });
  }

  navigateToRegister() {
    this.router.navigate(['/register']);
  }

  navigateToLogin() {
    this.router.navigate(['/login']);
  }

  navigateToMap() {
    this.router.navigate(['/map']);
  }

  scrollToSection(sectionId: string) {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}