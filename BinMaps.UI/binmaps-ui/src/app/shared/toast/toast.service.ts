import { Injectable, signal } from '@angular/core';

export type ToastVariant = 'success' | 'info' | 'warning' | 'danger';

export interface ToastOptions {

  title: string;
  message?: string;
  detail?: string;
  variant?: ToastVariant;
  duration?: number;
  prominent?: boolean;
  action?: {
    label: string;
    handler: () => void;
  };
}

export interface Toast extends ToastOptions {
  id: number;
  variant: ToastVariant;
  duration: number;
  leaving?: boolean;
}


@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private timers = new Map<number, ReturnType<typeof setTimeout>>();

  readonly toasts = signal<Toast[]>([]);

  show(opts: ToastOptions): number {
   
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

  dismiss(id: number): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.toasts.update(list =>
      list.map(t => (t.id === id ? { ...t, leaving: true } : t)),
    );
 
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
