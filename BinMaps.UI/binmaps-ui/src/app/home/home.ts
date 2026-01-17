import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: './home.html',
  styleUrls: ['./home.css'],
  imports: [CommonModule]
})
export class HomeComponent {

  currentYear = new Date().getFullYear();

  stats = [
    { number: '10,000+', label: 'Контейнери' },
    { number: '50+', label: 'Камиона' },
    { number: '24/7', label: 'Мониторинг' },
    { number: '95%', label: 'Ефективност' }
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
      description: 'Докладвай за препълнени или повредени контейнери чрез QR код и AI анализ на снимки.'
    },
    {
      icon: 'ai',
      title: 'AI интелигентност',
      description: 'Автоматичен анализ на репорти със снимки и интелигентна верификация на състоянието.'
    },
    {
      icon: 'route',
      title: 'Оптимални маршрути',
      description: 'Алгоритми за най-ефективни маршрути на камионите базирани на състояние и приоритет.'
    },
    {
      icon: 'sensor',
      title: 'IoT сензори',
      description: 'Мониторинг на запълване, температура и статус на всеки контейнер чрез сензори.'
    },
    {
      icon: 'notification',
      title: 'Нотификации',
      description: 'Автоматични известия за спешни случаи като пожари или критично препълване.'
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
      description: 'Алгоритъмът изчислява най-ефективните маршрути за камионите по зони.'
    },
    {
      step: '4',
      title: 'Изпълнение',
      description: 'Шофьорите получават инструкции и обслужват контейнерите по оптималния маршрут.'
    }
  ];

  constructor(private router: Router) {}

  navigateToRegister() {
    this.router.navigate(['/register']);
  }

  navigateToLogin() {
    this.router.navigate(['/login']);
  }

  scrollToSection(sectionId: string) {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}