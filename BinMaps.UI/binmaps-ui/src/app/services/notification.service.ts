import { Injectable, signal } from '@angular/core';
import { AuthService } from './auth.service';

export interface Notification {
  id: string;
  type: 'fire' | 'full' | 'report' | 'route';
  severity: 'critical' | 'warning' | 'info';
  iconType: 'eco' | 'danger' | 'warn' | 'blue';
  title: string;
  description: string;
  timeAgo: string;
  read: boolean;
  filter: 'critical' | 'route' | 'reports' | 'all';
  forRoles: string[];
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private _notifications = signal<Notification[]>([]);
  readonly notifications  = this._notifications.asReadonly();
  readonly unreadCount    = signal<number>(0);

  private currentRole = '';

  constructor(private auth: AuthService) {
    this.auth.currentUser$.subscribe(user => {
      this.currentRole = user?.role ?? '';
    });
  }

  push(notif: Omit<Notification, 'id' | 'read'>): void {
    if (!notif.forRoles.includes(this.currentRole)) return;
    const n: Notification = { ...notif, id: crypto.randomUUID(), read: false };
    this._notifications.update(list => [n, ...list].slice(0, 50));
    this.recalcUnread();
  }

  markAllRead(): void {
    this._notifications.update(list => list.map(n => ({ ...n, read: true })));
    this.unreadCount.set(0);
  }

  markRead(id: string): void {
    this._notifications.update(list =>
      list.map(n => (n.id === id ? { ...n, read: true } : n))
    );
    this.recalcUnread();
  }

  forFilter(filter: string): Notification[] {
    const all = this._notifications().filter(n =>
      n.forRoles.includes(this.currentRole)
    );
    return filter === 'all' ? all : all.filter(n => n.filter === filter);
  }

  private recalcUnread(): void {
    this.unreadCount.set(this._notifications().filter(n => !n.read).length);
  }
}