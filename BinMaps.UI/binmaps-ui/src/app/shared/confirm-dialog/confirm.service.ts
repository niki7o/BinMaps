import { Injectable, signal } from '@angular/core';

export type ConfirmVariant = 'danger' | 'warning' | 'info';

export interface ConfirmChoice<T extends string = string> {
  
  key: T;
  label: string;
  description?: string;
  icon?: string;
  variant?: ConfirmVariant;
  disabled?: boolean;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  detail?: string;
  requireText?: string;
  choices?: ReadonlyArray<ConfirmChoice>;
}

interface InternalRequest extends ConfirmOptions {
  open: boolean;
  typed: string;
  resolve: (accepted: boolean | string | null) => void;
  
  mode: 'ask' | 'choice';
}


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

  pickChoice(key: string): void {
    const s = this.state();
    if (!s) return;
    s.resolve(key);
    this.state.set(null);
  }

  cancel(): void {
    const s = this.state();
    if (!s) return;
   
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
