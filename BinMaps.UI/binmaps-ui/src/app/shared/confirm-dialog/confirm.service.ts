import { Injectable, signal } from '@angular/core';

export type ConfirmVariant = 'danger' | 'warning' | 'info';

export interface ConfirmChoice<T extends string = string> {
  /** Value returned from askChoice() when this option is picked. */
  key: T;
  /** Bold primary label shown on the choice card. */
  label: string;
  /** Optional secondary line (e.g. a count or short hint). */
  description?: string;
  /** Optional single-character glyph shown as a leading icon. */
  icon?: string;
  /** Visual variant of the choice card (border + glow). */
  variant?: ConfirmVariant;
  /** Disable the choice (e.g. "selected" when nothing is selected). */
  disabled?: boolean;
}

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
  /** When provided, the dialog renders each choice as a clickable card
   *  instead of a single confirm button. `askChoice()` resolves with the
   *  selected key (or `null` on cancel). */
  choices?: ReadonlyArray<ConfirmChoice>;
}

interface InternalRequest extends ConfirmOptions {
  open: boolean;
  typed: string;
  /** For plain ask(): resolved with boolean. For askChoice(): resolved
   *  with the chosen key (or null). Stored as a loose function so one
   *  component can service both flows. */
  resolve: (accepted: boolean | string | null) => void;
  /** Distinguishes ask() vs askChoice() for the resolver. */
  mode: 'ask' | 'choice';
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
 * For multi-choice dialogs (e.g. "selected" vs "all"):
 *   const pick = await this.confirm.askChoice({
 *     title: 'Изчисти сигнали',
 *     message: 'Какво искаш да изчистиш?',
 *     variant: 'danger',
 *     choices: [
 *       { key: 'selected', label: 'Само избраните (3)', variant: 'warning' },
 *       { key: 'all',      label: 'Всички по филтъра (120)', variant: 'danger' },
 *     ],
 *   });
 *   if (pick === null) return;           // user cancelled
 *   if (pick === 'selected') { ... }
 *   if (pick === 'all')      { ... }
 *
 * The actual modal is rendered once at app root by <app-confirm-dialog/>,
 * which reads the `state` signal below.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly state = signal<InternalRequest | null>(null);

  ask(opts: ConfirmOptions): Promise<boolean> {
    this.dismissExisting();

    return new Promise<boolean>(resolve => {
      this.state.set({
        open: true,
        typed: '',
        confirmText: 'Потвърди',
        cancelText: 'Отказ',
        variant: 'info',
        ...opts,
        mode: 'ask',
        resolve: (v) => resolve(v === true),
      });
    });
  }

  /**
   * Like `ask()` but presents a set of choice cards. Resolves with the
   * picked choice's `key`, or `null` if the user cancels / dismisses.
   */
  askChoice<T extends string>(
    opts: Omit<ConfirmOptions, 'confirmText'> & { choices: ReadonlyArray<ConfirmChoice<T>> },
  ): Promise<T | null> {
    this.dismissExisting();

    return new Promise<T | null>(resolve => {
      this.state.set({
        open: true,
        typed: '',
        cancelText: 'Отказ',
        variant: 'info',
        ...opts,
        mode: 'choice',
        resolve: (v) => resolve(typeof v === 'string' ? (v as T) : null),
      });
    });
  }

  /**
   * One-button acknowledgement dialog — the professional replacement for
   * `window.alert()`. Resolves when the user clicks the button or presses Esc.
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

  /** Pick a specific choice (used by multi-choice dialog). */
  pickChoice(key: string): void {
    const s = this.state();
    if (!s) return;
    s.resolve(key);
    this.state.set(null);
  }

  cancel(): void {
    const s = this.state();
    if (!s) return;
    // On a choice dialog, cancel resolves with null; on ask(), with false.
    s.resolve(s.mode === 'choice' ? null : false);
    this.state.set(null);
  }

  private dismissExisting(): void {
    const current = this.state();
    if (current?.open) {
      current.resolve(current.mode === 'choice' ? null : false);
    }
  }
}
