import { Component, OnInit, OnDestroy, HostListener, signal, computed } from '@angular/core';
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

  readonly isLoggedIn = computed(() => !!this.currentUser());
  readonly isAdmin    = computed(() => this.currentUser()?.role === 'Admin');
  readonly isDriver   = computed(() => this.currentUser()?.role === 'Driver');
  readonly initials   = computed(() =>
    (this.currentUser()?.userName ?? '').slice(0, 2).toUpperCase() || 'U'
  );

  get notifications() { return this.notifService.notifications(); }
  get unreadCount()   { return this.notifService.unreadCount;     }

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly notifService: NotificationService
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

  markAllRead(): void {
    this.notifService.markAllRead();
  }

  markRead(id: string): void {
    this.notifService.markRead(id);
  }

  logout(): void {
    this.authService.logout();
    this.showUserMenu.set(false);
    this.router.navigate(['/']);
  }
}
