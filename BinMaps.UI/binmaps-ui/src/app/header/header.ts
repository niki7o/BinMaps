import { Component, OnInit, OnDestroy, HostListener, signal, computed, effect } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { AuthUser } from '../services/auth.models';
import { NotificationService } from '../services/notification.service';

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
  readonly justReceived   = signal(false);

  private _prevUnreadCount = 0;
  private _bellTimer: ReturnType<typeof setTimeout> | null = null;

  readonly isLoggedIn = computed(() => !!this.currentUser());
  readonly isAdmin    = computed(() => this.currentUser()?.role === 'Admin');
  readonly isDriver   = computed(() => this.currentUser()?.role === 'Driver');
  readonly initials   = computed(() =>
    (this.currentUser()?.userName ?? '').slice(0, 2).toUpperCase() || 'Ме'
  );

  get notifications() { return this.notifService.notifications(); }
  get unreadCount()   { return this.notifService.unreadCount;     }

  readonly hasCriticalUnread = computed(() =>
    this.notifService.notifications().some(n => !n.read && n.severity === 'critical')
  );

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly notifService: NotificationService
  ) {
   
    effect(() => {
      const current = this.notifService.notifications()
        .filter(n => !n.read).length;
      if (current > this._prevUnreadCount) {
        this.justReceived.set(true);
        if (this._bellTimer) clearTimeout(this._bellTimer);
        this._bellTimer = setTimeout(() => this.justReceived.set(false), 2000);
      }
      this._prevUnreadCount = current;
    });
  }

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
    if (this._bellTimer) clearTimeout(this._bellTimer);
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

  markAllRead(): void {
    this.notifService.markAllRead();
  }

  markRead(id: string): void { this.notifService.markRead(id); }
  removeNotif(id: string): void { this.notifService.remove(id); }

  navigateToNotification(n: { id: string; actionUrl?: string }): void {
    this.notifService.markRead(n.id);
    this.showNotifPanel.set(false);
    if (n.actionUrl) {
      this.router.navigateByUrl(n.actionUrl);
    }
  }

  goToNotificationsPage(): void {
    this.showNotifPanel.set(false);
    this.router.navigate(['/notifications']);
  }

  logout(): void {
    this.authService.logout();
    this.showUserMenu.set(false);
    this.router.navigate(['/']);
  }
}
