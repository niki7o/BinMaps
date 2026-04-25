import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { NotificationService, Notification } from '../services/notification.service';
import { ConfirmService } from '../shared/confirm-dialog/confirm.service';

type FilterTab = 'all' | 'critical' | 'reports' | 'route';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './notifications.html',
  styleUrls: ['./notifications.css']
})
export class NotificationsComponent {

  readonly activeFilter  = signal<FilterTab>('all');

  /** Selection mode toggles when user clicks "Изчисти". */
  readonly selectMode    = signal<boolean>(false);
  /** Set of currently checked notification ids. */
  readonly selectedIds   = signal<ReadonlySet<string>>(new Set<string>());

  readonly filtered = computed(() => {
    const f   = this.activeFilter();
    const all = this.notifService.notifications();
    return f === 'all' ? all : all.filter(n => n.filter === f);
  });

  readonly totalCount    = computed(() => this.notifService.notifications().length);
  readonly unreadCount   = computed(() => this.notifService.unreadCount());
  readonly criticalCount = computed(() => this.notifService.notifications().filter(n => n.filter === 'critical').length);
  readonly reportCount   = computed(() => this.notifService.notifications().filter(n => n.filter === 'reports').length);
  readonly routeCount    = computed(() => this.notifService.notifications().filter(n => n.filter === 'route').length);

  readonly selectedCount = computed(() => this.selectedIds().size);
  readonly allOnPageSelected = computed(() => {
    const ids = this.filtered();
    if (ids.length === 0) return false;
    const sel = this.selectedIds();
    return ids.every(n => sel.has(n.id));
  });
  readonly someSelected = computed(() => this.selectedCount() > 0 && !this.allOnPageSelected());

  constructor(
    private readonly notifService: NotificationService,
    private readonly confirm: ConfirmService,
    private readonly router: Router
  ) {}

  // ─────────────────────────── Filtering ───────────────────────────

  setFilter(f: FilterTab): void {
    this.activeFilter.set(f);
    if (this.selectMode()) {
      // Drop selections that are no longer visible — keeps the count honest.
      const visible = new Set(this.filtered().map(n => n.id));
      this.selectedIds.update(sel => {
        const next = new Set<string>();
        for (const id of sel) if (visible.has(id)) next.add(id);
        return next;
      });
    }
  }

  // ─────────────────────────── Item interaction ────────────────────

  onItemClick(n: Notification): void {
    if (this.selectMode()) {
      this.toggleSelected(n.id);
      return;
    }
    this.notifService.markRead(n.id);
    if (n.actionUrl) {
      this.router.navigateByUrl(n.actionUrl);
    }
  }

  removeNotif(id: string, e: Event): void {
    e.stopPropagation();
    this.notifService.remove(id);
    // Keep selection set tidy.
    this.selectedIds.update(sel => {
      if (!sel.has(id)) return sel;
      const next = new Set(sel);
      next.delete(id);
      return next;
    });
  }

  markAllRead(): void {
    this.notifService.markAllRead();
  }

  // ─────────────────────────── Selection mode ──────────────────────

  /** Entry point — clicking "Изчисти" enters selection mode. */
  enterSelectMode(): void {
    this.selectMode.set(true);
    this.selectedIds.set(new Set<string>());
  }

  exitSelectMode(): void {
    this.selectMode.set(false);
    this.selectedIds.set(new Set<string>());
  }

  toggleSelected(id: string): void {
    this.selectedIds.update(sel => {
      const next = new Set(sel);
      if (next.has(id)) next.delete(id);
      else              next.add(id);
      return next;
    });
  }

  toggleSelectAllOnPage(): void {
    const ids = this.filtered().map(n => n.id);
    const sel = this.selectedIds();
    const allSelected = ids.length > 0 && ids.every(id => sel.has(id));
    if (allSelected) {
      // Deselect only the visible ones — keep selections from other tabs.
      this.selectedIds.update(s => {
        const next = new Set(s);
        for (const id of ids) next.delete(id);
        return next;
      });
    } else {
      this.selectedIds.update(s => {
        const next = new Set(s);
        for (const id of ids) next.add(id);
        return next;
      });
    }
  }

  isChecked(id: string): boolean {
    return this.selectedIds().has(id);
  }

  async confirmDeleteSelection(): Promise<void> {
    const sel = this.selectedIds();
    if (sel.size === 0) return;

    const ok = await this.confirm.ask({
      title: 'Изтриване на избрани',
      message: `Сигурни ли сте, че искате да премахнете ${sel.size} ${sel.size === 1 ? 'известие' : 'известия'}?`,
      detail: 'Действието е необратимо.',
      variant: 'danger',
      confirmText: 'Изтрий',
      cancelText: 'Отказ',
    });
    if (!ok) return;

    this.notifService.removeMany(Array.from(sel));
    this.exitSelectMode();
  }

  /** Power-user shortcut: select all on the current filter and clear them in one step. */
  async clearAllOnFilter(): Promise<void> {
    const visible = this.filtered();
    if (visible.length === 0) return;

    const ok = await this.confirm.ask({
      title: 'Изчисти всички',
      message: `Премахване на ${visible.length} ${visible.length === 1 ? 'известие' : 'известия'} от текущия филтър?`,
      detail: 'Действието е необратимо.',
      variant: 'danger',
      confirmText: 'Изчисти',
      cancelText: 'Отказ',
    });
    if (!ok) return;

    this.notifService.removeMany(visible.map(n => n.id));
    this.exitSelectMode();
  }

  // ─────────────────────────── View helpers ────────────────────────

  getSeverityClass(n: Notification): string {
    return `npage-item--${n.severity}`;
  }

  getIconPath(type: string): string {
    switch (type) {
      case 'fire':   return 'M12 2c-2 3-3 6-3 9a3 3 0 006 0c0-2-1-4-2-5-1 2-2 3-1 5a1 1 0 01-2 0c0-3 1-6 2-9z';
      case 'report': return 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z';
      case 'route':  return 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5';
      default:       return 'M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
    }
  }

  trackById(_: number, n: Notification): string { return n.id; }
}
