import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { NotificationService, Notification } from '../services/notification.service';

type FilterTab = 'all' | 'critical' | 'reports' | 'route';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './notifications.html',
  styleUrls: ['./notifications.css']
})
export class NotificationsComponent {

  readonly activeFilter = signal<FilterTab>('all');

  readonly filtered = computed(() => {
    const f = this.activeFilter();
    const all = this.notifService.notifications();
    return f === 'all' ? all : all.filter(n => n.filter === f);
  });

  readonly totalCount  = computed(() => this.notifService.notifications().length);
  readonly unreadCount= computed(() => this.notifService.unreadCount());
  readonly criticalCount = computed(() => this.notifService.notifications().filter(n => n.filter === 'critical').length);
  readonly reportCount= computed(() => this.notifService.notifications().filter(n => n.filter === 'reports').length);
  readonly routeCount = computed(() => this.notifService.notifications().filter(n => n.filter === 'route').length);

  constructor(
    private readonly notifService: NotificationService,
    private readonly router: Router
  ) {}

  setFilter(f: FilterTab): void {
    this.activeFilter.set(f);
  }

  openNotification(n: Notification): void {
    this.notifService.markRead(n.id);
    if (n.actionUrl) {
      this.router.navigateByUrl(n.actionUrl);
    }
  }

  removeNotif(id: string, e: Event): void {
    e.stopPropagation();
    this.notifService.remove(id);
  }

  markAllRead(): void {
    this.notifService.markAllRead();
  }

  clearAll(): void {
    this.notifService.clearAll();
  }

  getSeverityClass(n: Notification): string {
    return `npage-item--${n.severity}`;
  }

  getIconPath(type: string): string {
    switch (type) {
      case 'fire':  return 'M12 2c-2 3-3 6-3 9a3 3 0 006 0c0-2-1-4-2-5-1 2-2 3-1 5a1 1 0 01-2 0c0-3 1-6 2-9z';
      case 'report': return 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z';
      case 'route': return 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5';
      default:  return 'M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
    }
  }

  trackById(_: number, n: Notification): string { return n.id; }
}
