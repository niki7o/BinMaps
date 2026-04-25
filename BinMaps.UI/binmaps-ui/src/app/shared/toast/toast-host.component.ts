import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, Toast } from './toast.service';

/**
 * Mounts once at app root (next to <app-confirm-dialog/>). Renders the
 * current toast stack from ToastService. Toasts slide in from the right,
 * gently float up to make room for new ones, and fade out on dismiss.
 *
 *   <app-toast-host/>
 */
@Component({
  selector: 'app-toast-host',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-stack" role="region" aria-live="polite" aria-label="Известия">
      @for (t of toasts(); track t.id) {
        <div
          class="toast"
          [attr.data-variant]="t.variant"
          [class.is-leaving]="t.leaving"
          role="status">

          <span class="toast__icon" aria-hidden="true">
            @switch (t.variant) {
              @case ('success') {
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              }
              @case ('warning') {
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              }
              @case ('danger') {
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="15" y1="9" x2="9" y2="15"/>
                  <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
              }
              @default {
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="16" x2="12" y2="12"/>
                  <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
              }
            }
          </span>

          <div class="toast__body">
            <div class="toast__title">{{ t.title }}</div>
            @if (t.message) {
              <div class="toast__message">{{ t.message }}</div>
            }
            @if (t.detail) {
              <div class="toast__detail">{{ t.detail }}</div>
            }
          </div>

          @if (t.action) {
            <button
              type="button"
              class="toast__action"
              (click)="onAction(t)">
              {{ t.action.label }}
            </button>
          }

          <button
            type="button"
            class="toast__close"
            aria-label="Затвори"
            (click)="dismiss(t.id)">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>

          @if (t.duration > 0 && !t.leaving) {
            <span
              class="toast__progress"
              [style.animation-duration.ms]="t.duration"></span>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      position: fixed;
      top: 0; right: 0;
      z-index: 1200;
      pointer-events: none;
    }

    .toast-stack {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 24px;
      max-width: min(420px, calc(100vw - 32px));
      pointer-events: none;
    }

    .toast {
      position: relative;
      display: grid;
      grid-template-columns: auto 1fr auto auto;
      align-items: flex-start;
      gap: 14px;
      padding: 14px 16px 14px 16px;
      border-radius: 14px;
      background: linear-gradient(180deg, rgba(15, 35, 41, 0.96) 0%, rgba(8, 22, 26, 0.96) 100%);
      border: 1px solid rgba(148, 163, 184, 0.16);
      box-shadow:
        0 24px 48px -20px rgba(0, 0, 0, 0.55),
        0 1px 0 rgba(255, 255, 255, 0.04) inset;
      backdrop-filter: blur(8px) saturate(120%);
      -webkit-backdrop-filter: blur(8px) saturate(120%);
      color: #e2e8f0;
      pointer-events: auto;
      overflow: hidden;
      transform-origin: 100% 50%;
      animation: toast-slide-in 280ms cubic-bezier(0.22, 1, 0.36, 1);
      will-change: transform, opacity;
    }
    .toast.is-leaving {
      animation: toast-slide-out 220ms cubic-bezier(0.55, 0, 0.65, 1) forwards;
    }

    /* Variant accent — coloured left rail + glow */
    .toast::before {
      content: '';
      position: absolute;
      top: 10px; bottom: 10px; left: 0;
      width: 3px;
      border-radius: 0 3px 3px 0;
    }
    .toast[data-variant="success"]::before { background: linear-gradient(180deg, #34d399, #059669); }
    .toast[data-variant="info"]::before    { background: linear-gradient(180deg, #38bdf8, #0284c7); }
    .toast[data-variant="warning"]::before { background: linear-gradient(180deg, #fbbf24, #d97706); }
    .toast[data-variant="danger"]::before  { background: linear-gradient(180deg, #f87171, #dc2626); }

    .toast[data-variant="success"] {
      box-shadow:
        0 24px 48px -20px rgba(16, 185, 129, 0.35),
        0 1px 0 rgba(255, 255, 255, 0.04) inset;
    }
    .toast[data-variant="warning"] {
      box-shadow:
        0 24px 48px -20px rgba(245, 158, 11, 0.4),
        0 1px 0 rgba(255, 255, 255, 0.04) inset;
    }
    .toast[data-variant="danger"] {
      box-shadow:
        0 24px 48px -20px rgba(239, 68, 68, 0.45),
        0 1px 0 rgba(255, 255, 255, 0.04) inset;
    }

    .toast__icon {
      flex: 0 0 auto;
      width: 36px; height: 36px;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .toast[data-variant="success"] .toast__icon {
      background: radial-gradient(circle at 30% 30%, rgba(16,185,129,0.32), rgba(16,185,129,0.08));
      color: #6ee7b7;
      box-shadow: 0 0 0 1px rgba(16,185,129,0.25);
    }
    .toast[data-variant="info"] .toast__icon {
      background: radial-gradient(circle at 30% 30%, rgba(56,189,248,0.30), rgba(56,189,248,0.08));
      color: #93c5fd;
      box-shadow: 0 0 0 1px rgba(56,189,248,0.25);
    }
    .toast[data-variant="warning"] .toast__icon {
      background: radial-gradient(circle at 30% 30%, rgba(245,158,11,0.32), rgba(245,158,11,0.08));
      color: #fcd34d;
      box-shadow: 0 0 0 1px rgba(245,158,11,0.28);
    }
    .toast[data-variant="danger"] .toast__icon {
      background: radial-gradient(circle at 30% 30%, rgba(239,68,68,0.32), rgba(239,68,68,0.08));
      color: #fca5a5;
      box-shadow: 0 0 0 1px rgba(239,68,68,0.28);
    }

    .toast__body { min-width: 0; }
    .toast__title {
      font-size: 14px;
      font-weight: 650;
      letter-spacing: -0.005em;
      color: #f8fafc;
      line-height: 1.35;
    }
    .toast__message {
      margin-top: 2px;
      font-size: 13px;
      color: #cbd5e1;
      line-height: 1.45;
      word-wrap: break-word;
    }
    .toast__detail {
      margin-top: 4px;
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.4;
    }

    .toast__action {
      align-self: center;
      padding: 6px 12px;
      background: rgba(148, 163, 184, 0.10);
      border: 1px solid rgba(148, 163, 184, 0.20);
      border-radius: 8px;
      color: #e2e8f0;
      font: inherit;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      transition: background 120ms, border-color 120ms;
      white-space: nowrap;
    }
    .toast__action:hover {
      background: rgba(148, 163, 184, 0.18);
      border-color: rgba(148, 163, 184, 0.32);
    }

    .toast__close {
      align-self: flex-start;
      width: 26px; height: 26px;
      background: transparent;
      border: 1px solid transparent;
      color: #64748b;
      border-radius: 7px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 120ms, color 120ms, border-color 120ms;
    }
    .toast__close:hover {
      background: rgba(148, 163, 184, 0.10);
      color: #e2e8f0;
      border-color: rgba(148, 163, 184, 0.22);
    }

    .toast__progress {
      position: absolute;
      left: 0; bottom: 0;
      height: 2px;
      width: 100%;
      transform-origin: left;
      animation-name: toast-progress;
      animation-timing-function: linear;
      animation-fill-mode: forwards;
      opacity: 0.65;
    }
    .toast[data-variant="success"] .toast__progress { background: linear-gradient(90deg, transparent, #34d399); }
    .toast[data-variant="info"]    .toast__progress { background: linear-gradient(90deg, transparent, #38bdf8); }
    .toast[data-variant="warning"] .toast__progress { background: linear-gradient(90deg, transparent, #fbbf24); }
    .toast[data-variant="danger"]  .toast__progress { background: linear-gradient(90deg, transparent, #f87171); }

    @keyframes toast-slide-in {
      from { transform: translateX(120%) scale(0.96); opacity: 0; }
      to   { transform: translateX(0)    scale(1);    opacity: 1; }
    }
    @keyframes toast-slide-out {
      from { transform: translateX(0)    scale(1);    opacity: 1; }
      to   { transform: translateX(120%) scale(0.96); opacity: 0; }
    }
    @keyframes toast-progress {
      from { transform: scaleX(1); }
      to   { transform: scaleX(0); }
    }

    @media (max-width: 480px) {
      .toast-stack { padding: 14px; max-width: calc(100vw - 16px); }
      .toast { padding: 12px 14px; gap: 12px; border-radius: 12px; }
      .toast__icon { width: 32px; height: 32px; }
    }

    @media (prefers-reduced-motion: reduce) {
      .toast { animation: none; }
      .toast.is-leaving { animation: none; opacity: 0; }
      .toast__progress { animation: none; opacity: 0; }
    }
  `],
})
export class ToastHostComponent {
  private readonly svc = inject(ToastService);
  readonly toasts = this.svc.toasts;

  dismiss(id: number): void {
    this.svc.dismiss(id);
  }

  onAction(t: Toast): void {
    try { t.action?.handler(); } finally { this.svc.dismiss(t.id); }
  }
}
