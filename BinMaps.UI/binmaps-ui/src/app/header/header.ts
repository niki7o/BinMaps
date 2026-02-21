import { Component, OnInit, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { NotificationService, Notification } from '../services/notification.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.html',
  styleUrls: ['./header.css']
})
export class Header implements OnInit {
  private auth   = inject(AuthService);
  private notifs = inject(NotificationService);

  isScrolled     = false;
  isSolidPage    = false;
  userMenuOpen   = false;
  notifPanelOpen = false;
  notifFilter    = 'all';

  readonly solidPages = ['/map', '/analytics', '/admin', '/profile'];

  get isLoggedIn()  { return this.auth.isLoggedIn(); }
  get role()        { return this.auth.role; }
  get roleLabel()   { return this.roleLabelMap[this.role] ?? this.role; }
  get userName()    { return this.auth.currentUser()?.name ?? ''; }
  get userInitials(){ return this.userName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(); }
  get unreadCount() { return this.notifs.unreadCount(); }

  get filteredNotifications(): Notification[] {
    return this.notifs.forFilter(this.notifFilter);
  }

  private readonly roleLabelMap: Record<string, string> = {
    User:   'Гражданин',
    Driver: 'Шофьор',
    Admin:  'Администратор'
  };

  ngOnInit(): void {
    this.checkSolidPage(window.location.pathname);
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.isScrolled = window.scrollY > 20;
  }

  @HostListener('window:click', ['$event'])
  onWindowClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.closest('.navbar__user') && this.userMenuOpen) {
      this.userMenuOpen = false;
    }
  }

  toggleUserMenu(): void   { this.userMenuOpen = !this.userMenuOpen; }
  toggleNotifications(): void {
    this.notifPanelOpen = !this.notifPanelOpen;
    if (!this.notifPanelOpen) return;
  }

  markAllRead(): void { this.notifs.markAllRead(); }

  logout(): void {
    this.userMenuOpen = false;
    this.auth.logout();
  }

  private checkSolidPage(path: string): void {
    this.isSolidPage = this.solidPages.some(p => path.startsWith(p));
  }
}