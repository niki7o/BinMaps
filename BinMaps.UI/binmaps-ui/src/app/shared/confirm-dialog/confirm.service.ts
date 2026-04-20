import { Injectable, signal } from '@angular/core';

export type ConfirmVariant = 'danger' | 'warning' | 'info';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  /** Optional second line shown in smaller muted text below the main message. */
  detail?: string;
  /** When true, the confirm button requires typing the `requireText` string
   *  to be enabled — use for truly destructive actions. */
  requireText?: string;
}

interface InternalRequest extends ConfirmOptions {
  open: boolean;
  typed: string;
  resolve: (accepted: boolean) => void;
}

/**
 * Promise-based confirmation dialog service.
 *
 * Usage:
 *   const ok = await this.confirm.ask({
 *     title: 'Изтриване',
 *     message: 'Сигурни ли сте?',
 *     variant: 'danger',
 *     confirmText: 'Изтрий',
 *   });
 *   if (!ok) return;
 *
 * The actual modal is rendered once at app root by <app-confirm-dialog/>,
 * which reads the `state` signal below.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly state = signal<InternalRequest | null>(null);

  ask(opts: ConfirmOptions): Promise<boolean> {
    // If another dialog is already open, reject the previous one so we
    // never stack multiple modals.
    const current = this.state();
    if (current?.open) current.resolve(false);

    return new Promise<boolean>(resolve => {
      this.state.set({
        open: true,
        typed: '',
        confirmText: 'Потвърди',
        cancelText: 'Отказ',
        variant: 'info',
        ...opts,
        resolve,
      });
    });
  }

  /**
   * One-button acknowledgement dialog — the professional replacement for
   * `window.alert()`. Resolves when the user clicks the button or presses Esc.
   * Pass `variant` to tint the header (info / warning / danger).
   */
  notify(opts: {
    title: string;
    message: string;
    detail?: string;
    variant?: ConfirmVariant;
    okText?: string;
  }): Promise<void> {
    return this.ask({
      title: opts.title,
      message: opts.message,
      detail: opts.detail,
      variant: opts.variant ?? 'info',
      confirmText: opts.okText ?? 'OK',
      // Empty cancelText tells the dialog component to hide the cancel button.
      cancelText: '',
    }).then(() => undefined);
  }

  setTyped(value: string): void {
    const s = this.state();
    if (s) this.state.set({ ...s, typed: value });
  }

  accept(): void {
    const s = this.state();
    if (!s) return;
    if (s.requireText && s.typed !== s.requireText) return;
    s.resolve(true);
    this.state.set(null);
  }

  cancel(): void {
    const s = this.state();
    if (!s) return;
    s.resolve(false);
    this.state.set(null);
  }
}
