import { Injectable, signal } from '@angular/core';

export type ToastVariant = 'success' | 'info' | 'warning' | 'danger';

export interface ToastOptions {
  /** Bold first line. */
  title: string;
  /** Optional second line — keep short. */
  message?: string;
  /** Optional muted third line — e.g. "Събран товар: 1240 л". */
  detail?: string;
  /** Visual style + icon. */
  variant?: ToastVariant;
  /** Milliseconds before auto-dismiss. Default 4500. Pass 0 to keep it sticky. */
  duration?: number;
  /**
   * When true, the toast renders in a much larger, hero-style card with a
   * bigger icon, larger type, a soft pulsing glow, and a longer default
   * duration. Use this for celebratory or important events that the user
   * shouldn't miss — e.g. "Маршрут завършен". Default false.
   */
  prominent?: boolean;
  /** Optional CTA — shown as a small button on the right. */
  action?: {
    label: string;
    handler: () => void;
  };
}

export interface Toast extends ToastOptions {
  id: number;
  variant: ToastVariant;
  duration: number;
  /** Set when the toast starts its leave animation. */
  leaving?: boolean;
}

/**
 * App-wide toast service. The single <app-toast-host/> at the app root
 * subscribes to the `toasts` signal and renders the stack.
 *
 *   toast.success({ title: 'Маршрут завършен', message: 'Посетени: 12' });
 *   toast.error({ title: 'Грешка', message: '...' });
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private timers = new Map<number, ReturnType<typeof setTimeout>>();

  readonly toasts = signal<Toast[]>([]);

  show(opts: ToastOptions): number {
    // Prominent toasts default to a much longer dwell time (8s) so the user
    // has time to read the celebratory message — but the caller can still
    // override via `duration`.
    const defaultDuration = opts.prominent ? 8000 : 4500;
    const t: Toast = {
      id: this.nextId++,
      variant: opts.variant ?? 'info',
      duration: opts.duration ?? defaultDuration,
      ...opts,
    };
    this.toasts.update(list => [...list, t]);

    if (t.duration > 0) {
      const timer = setTimeout(() => this.dismiss(t.id), t.duration);
      this.timers.set(t.id, timer);
    }
    return t.id;
  }

  success(opts: Omit<ToastOptions, 'variant'>): number {
    return this.show({ ...opts, variant: 'success' });
  }
  info(opts: Omit<ToastOptions, 'variant'>): number {
    return this.show({ ...opts, variant: 'info' });
  }
  warning(opts: Omit<ToastOptions, 'variant'>): number {
    return this.show({ ...opts, variant: 'warning' });
  }
  error(opts: Omit<ToastOptions, 'variant'>): number {
    return this.show({ ...opts, variant: 'danger' });
  }

  /**
   * Begin the leave animation. The host removes the element after the
   * CSS transition finishes — we don't strip from state instantly so
   * the slide-out stays visible.
   */
  dismiss(id: number): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.toasts.update(list =>
      list.map(t => (t.id === id ? { ...t, leaving: true } : t)),
    );
    // Remove from state once the slide-out animation has run.
    setTimeout(() => {
      this.toasts.update(list => list.filter(t => t.id !== id));
    }, 240);
  }

  clearAll(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.toasts.set([]);
  }
}
