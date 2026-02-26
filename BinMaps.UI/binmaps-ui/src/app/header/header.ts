import { Component, OnInit, OnDestroy, HostListener, signal, computed } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { AuthUser } from '../services/auth.models';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.html',
  styleUrls: ['./header.css']
})
export class Header implements OnInit, OnDestroy {

  private readonly destroy$ = new Subject<void>();

  readonly isScrolled     = signal(false);
  readonly showUserMenu   = signal(false);
  readonly showNotifPanel = signal(false);
  readonly currentUser    = signal<AuthUser | null>(null);
  readonly unreadCount    = signal(0);

  readonly isLoggedIn = computed(() => !!this.currentUser());
  readonly isAdmin    = computed(() => this.currentUser()?.role === 'Admin');
  readonly isDriver   = computed(() => this.currentUser()?.role === 'Driver');
  readonly initials   = computed(() =>
    (this.currentUser()?.userName ?? '').slice(0, 2).toUpperCase() || 'U'
  );

  notifications: any[] = [
    {
      type: 'report',
      title: 'Нов сигнал в зона Център',
      message: 'Препълнен контейнер #45 – 94%',
      time: 'преди 8 мин',
      unread: true
    },
    {
      type: 'route',
      title: 'Маршрутът е генериран',
      message: '8 спирки · 12.4 km · приоритет критични',
      time: 'преди 32 мин',
      unread: false
    },
    {
      type: 'alert',
      title: 'Температурна аномалия',
      message: 'Контейнер #19 – +48°C – риск от запалване',
      time: 'преди 1 час',
      unread: true
    }
  ];

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        this.currentUser.set(user);
        this.showUserMenu.set(false);
        this.showNotifPanel.set(false);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.isScrolled.set(window.scrollY > 8);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (!t.closest('.navbar__user') && !t.closest('.user-menu'))
      this.showUserMenu.set(false);
    if (!t.closest('.navbar__notif') && !t.closest('.notif-dropdown'))
      this.showNotifPanel.set(false);
  }

  toggleUserMenu(e: Event): void {
    e.stopPropagation();
    this.showUserMenu.update(v => !v);
    this.showNotifPanel.set(false);
  }

  toggleNotifPanel(e: Event): void {
    e.stopPropagation();
    this.showNotifPanel.update(v => !v);
    this.showUserMenu.set(false);
  }

  logout(): void {
    this.authService.logout();
    this.showUserMenu.set(false);
    this.router.navigate(['/']);
  }
}