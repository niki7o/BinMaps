import { Component, HostListener, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfirmService } from './confirm.service';

/**
 * Global in-app confirmation dialog. Mount once (e.g. in AppComponent
 * template) — the dialog opens/closes in response to ConfirmService.
 *
 *   <app-confirm-dialog />
 *
 * Supports three layouts:
 *   • Standard confirm (confirmText / cancelText)
 *   • Acknowledgement  (single OK button, via .notify())
 *   • Multi-choice     (vertical stack of choice cards, via .askChoice())
 *
 * Styling matches the app's dark-emerald theme used in the admin dashboard.
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (req(); as s) {
      <div class="confirm-backdrop" role="presentation" (click)="onBackdrop()">
        <div
          class="confirm-card"
          role="alertdialog"
          aria-modal="true"
          [attr.aria-labelledby]="titleId"
          [attr.aria-describedby]="bodyId"
          [attr.data-variant]="s.variant ?? 'info'"
          (click)="$event.stopPropagation()">

          <div class="confirm-header">
            <div class="confirm-icon" [attr.data-variant]="s.variant ?? 'info'" aria-hidden="true">
              @switch (s.variant) {
                @case ('danger')  {
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                }
                @case ('warning') {
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                }
                @default {
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                }
              }
            </div>
            <button type="button" class="confirm-close" aria-label="Затвори" (click)="onCancel()">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <h2 class="confirm-title" [id]="titleId">{{ s.title }}</h2>
          <p class="confirm-message" [id]="bodyId">{{ s.message }}</p>

          @if (s.detail) {
            <p class="confirm-detail">{{ s.detail }}</p>
          }

          @if (s.choices?.length) {
            <div class="confirm-choices">
              @for (c of s.choices; track c.key) {
                <button
                  type="button"
                  class="choice-card"
                  [attr.data-variant]="c.variant ?? 'info'"
                  [disabled]="c.disabled"
                  (click)="onPickChoice(c.key)">
                  <span class="choice-icon" [attr.data-variant]="c.variant ?? 'info'" aria-hidden="true">
                    {{ c.icon ?? (c.variant === 'danger' ? '⚠' : c.variant === 'warning' ? '!' : '→') }}
                  </span>
                  <span class="choice-body">
                    <span class="choice-label">{{ c.label }}</span>
                    @if (c.description) {
                      <span class="choice-desc">{{ c.description }}</span>
                    }
                  </span>
                  <svg class="choice-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              }
            </div>
          }

          @if (s.requireText) {
            <label class="confirm-require-label">
              За да потвърдиш, напиши <code>{{ s.requireText }}</code>:
              <input
                type="text"
                class="confirm-require-input"
                autocomplete="off"
                spellcheck="false"
                [ngModel]="s.typed"
                (ngModelChange)="onTyped($event)"
                (keydown.enter)="canConfirm() && onAccept()"
                #typeInput
                autofocus />
            </label>
          }

          <div class="confirm-actions" [class.actions--single]="s.choices?.length">
            @if (s.cancelText) {
              <button
                type="button"
                class="confirm-btn confirm-btn--ghost"
                (click)="onCancel()">
                {{ s.cancelText }}
              </button>
            }
            @if (!s.choices?.length && s.confirmText) {
              <button
                type="button"
                class="confirm-btn"
                [attr.data-variant]="s.variant ?? 'info'"
                [disabled]="!canConfirm()"
                (click)="onAccept()">
                {{ s.confirmText }}
              </button>
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { position: fixed; inset: 0; pointer-events: none; z-index: 1100; }

    .confirm-backdrop {
      position: fixed; inset: 0;
      background:
        radial-gradient(1200px 600px at 50% 35%, rgba(16,185,129,0.08), transparent 60%),
        rgba(3, 10, 16, 0.72);
      backdrop-filter: blur(10px) saturate(120%);
      -webkit-backdrop-filter: blur(10px) saturate(120%);
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
      pointer-events: auto;
      animation: confirm-fade-in 160ms ease-out;
    }

    .confirm-card {
      position: relative;
      width: 100%; max-width: 460px;
      background: linear-gradient(180deg, rgba(16, 42, 48, 0.98) 0%, rgba(9, 24, 28, 0.98) 100%);
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 18px;
      padding: 24px 26px 22px;
      box-shadow:
        0 40px 80px -30px rgba(0, 0, 0, 0.85),
        0 0 0 1px rgba(255, 255, 255, 0.025) inset,
        0 1px 0 rgba(255,255,255,0.04) inset;
      color: #e2e8f0;
      animation: confirm-pop-in 220ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .confirm-card::before {
      content: '';
      position: absolute; inset: 0;
      border-radius: inherit;
      padding: 1px;
      background: linear-gradient(160deg, rgba(16,185,129,0.35), rgba(16,185,129,0) 45%, rgba(255,255,255,0.04));
      -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      -webkit-mask-composite: xor;
              mask-composite: exclude;
      pointer-events: none;
      opacity: 0.9;
    }
    .confirm-card[data-variant="danger"]::before  { background: linear-gradient(160deg, rgba(239,68,68,0.45), rgba(239,68,68,0) 45%, rgba(255,255,255,0.04)); }
    .confirm-card[data-variant="warning"]::before { background: linear-gradient(160deg, rgba(245,158,11,0.45), rgba(245,158,11,0) 45%, rgba(255,255,255,0.04)); }

    .confirm-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 14px;
    }

    .confirm-icon {
      width: 46px; height: 46px;
      border-radius: 14px;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .confirm-icon[data-variant="danger"] {
      background: radial-gradient(circle at 30% 30%, rgba(239,68,68,0.32), rgba(239,68,68,0.10));
      color: #fecaca;
      box-shadow: 0 0 0 1px rgba(239,68,68,0.3), 0 8px 24px -12px rgba(239,68,68,0.45);
    }
    .confirm-icon[data-variant="warning"] {
      background: radial-gradient(circle at 30% 30%, rgba(245,158,11,0.32), rgba(245,158,11,0.10));
      color: #fde68a;
      box-shadow: 0 0 0 1px rgba(245,158,11,0.3), 0 8px 24px -12px rgba(245,158,11,0.45);
    }
    .confirm-icon[data-variant="info"] {
      background: radial-gradient(circle at 30% 30%, rgba(16,185,129,0.30), rgba(16,185,129,0.08));
      color: #a7f3d0;
      box-shadow: 0 0 0 1px rgba(16,185,129,0.28), 0 8px 24px -12px rgba(16,185,129,0.4);
    }

    .confirm-close {
      background: transparent;
      border: 1px solid transparent;
      color: #94a3b8;
      width: 32px; height: 32px;
      border-radius: 8px;
      cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
      transition: background 120ms, color 120ms, border-color 120ms;
    }
    .confirm-close:hover {
      background: rgba(148,163,184,0.08);
      color: #e2e8f0;
      border-color: rgba(148,163,184,0.15);
    }

    .confirm-title {
      margin: 0 0 6px 0;
      font-size: 19px; font-weight: 650;
      letter-spacing: -0.015em;
      color: #f8fafc;
    }
    .confirm-message {
      margin: 0;
      font-size: 14px;
      line-height: 1.55;
      color: #cbd5e1;
    }
    .confirm-detail {
      margin: 8px 0 0 0;
      font-size: 12.5px;
      color: #94a3b8;
      line-height: 1.5;
    }

    /* ---------------- Choice cards ---------------- */
    .confirm-choices {
      display: flex; flex-direction: column; gap: 10px;
      margin-top: 18px;
    }
    .choice-card {
      display: flex; align-items: center; gap: 14px;
      width: 100%;
      text-align: left;
      padding: 13px 14px;
      background: rgba(148, 163, 184, 0.04);
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 12px;
      color: #e2e8f0;
      font: inherit;
      cursor: pointer;
      transition: transform 140ms cubic-bezier(0.22,1,0.36,1),
                  background 140ms, border-color 140ms, box-shadow 140ms;
    }
    .choice-card:not(:disabled):hover {
      background: rgba(148, 163, 184, 0.08);
      border-color: rgba(148, 163, 184, 0.28);
      transform: translateY(-1px);
    }
    .choice-card:not(:disabled):active { transform: translateY(0); }
    .choice-card:disabled { opacity: 0.45; cursor: not-allowed; }

    .choice-card[data-variant="danger"]:not(:disabled):hover {
      background: rgba(239, 68, 68, 0.08);
      border-color: rgba(239, 68, 68, 0.45);
      box-shadow: 0 10px 26px -18px rgba(239,68,68,0.6);
    }
    .choice-card[data-variant="warning"]:not(:disabled):hover {
      background: rgba(245, 158, 11, 0.08);
      border-color: rgba(245, 158, 11, 0.45);
      box-shadow: 0 10px 26px -18px rgba(245,158,11,0.6);
    }
    .choice-card[data-variant="info"]:not(:disabled):hover {
      background: rgba(16, 185, 129, 0.08);
      border-color: rgba(16, 185, 129, 0.45);
      box-shadow: 0 10px 26px -18px rgba(16,185,129,0.6);
    }

    .choice-icon {
      flex: 0 0 auto;
      width: 34px; height: 34px;
      border-radius: 10px;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 15px; font-weight: 700;
    }
    .choice-icon[data-variant="danger"]  { background: rgba(239,68,68,0.15);  color: #fecaca; }
    .choice-icon[data-variant="warning"] { background: rgba(245,158,11,0.15); color: #fde68a; }
    .choice-icon[data-variant="info"]    { background: rgba(16,185,129,0.15); color: #a7f3d0; }

    .choice-body {
      flex: 1; display: flex; flex-direction: column; gap: 2px;
      min-width: 0;
    }
    .choice-label {
      font-size: 14px; font-weight: 600; color: #f1f5f9;
      letter-spacing: -0.005em;
    }
    .choice-desc {
      font-size: 12px; color: #94a3b8;
    }

    .choice-chevron {
      color: #64748b;
      flex: 0 0 auto;
      transition: transform 140ms, color 140ms;
    }
    .choice-card:not(:disabled):hover .choice-chevron {
      color: #e2e8f0;
      transform: translateX(2px);
    }

    /* ---------------- Require-text confirmation ---------------- */
    .confirm-require-label {
      display: block;
      margin-top: 18px;
      font-size: 13px;
      color: #cbd5e1;
    }
    .confirm-require-label code {
      padding: 2px 6px; border-radius: 4px;
      background: rgba(239, 68, 68, 0.12);
      color: #fca5a5;
      font-size: 12.5px;
    }
    .confirm-require-input {
      display: block;
      width: 100%;
      margin-top: 8px;
      padding: 10px 12px;
      background: rgba(10,20,25,0.8);
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 10px;
      color: #e2e8f0;
      font: inherit;
      outline: none;
      transition: border-color 140ms, box-shadow 140ms;
    }
    .confirm-require-input:focus {
      border-color: rgba(16, 185, 129, 0.6);
      box-shadow: 0 0 0 3px rgba(16,185,129,0.15);
    }

    /* ---------------- Actions ---------------- */
    .confirm-actions {
      display: flex; gap: 10px; justify-content: flex-end;
      margin-top: 20px;
    }
    .confirm-actions.actions--single { margin-top: 16px; }

    .confirm-btn {
      padding: 10px 20px;
      border-radius: 10px;
      border: 1px solid transparent;
      font: inherit; font-weight: 600; font-size: 13.5px;
      cursor: pointer;
      transition: transform 90ms, filter 140ms, background 140ms, box-shadow 140ms;
    }
    .confirm-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .confirm-btn:not(:disabled):hover { filter: brightness(1.08); }
    .confirm-btn:not(:disabled):active { transform: translateY(1px); }

    .confirm-btn--ghost {
      background: transparent;
      color: #cbd5e1;
      border-color: rgba(148, 163, 184, 0.22);
    }
    .confirm-btn--ghost:hover { background: rgba(148,163,184,0.06); }

    .confirm-btn[data-variant="danger"] {
      background: linear-gradient(180deg, #ef4444, #dc2626);
      color: #fff;
      box-shadow: 0 8px 20px -8px rgba(239,68,68,0.6);
    }
    .confirm-btn[data-variant="warning"] {
      background: linear-gradient(180deg, #f59e0b, #d97706);
      color: #fff;
      box-shadow: 0 8px 20px -8px rgba(245,158,11,0.6);
    }
    .confirm-btn[data-variant="info"] {
      background: linear-gradient(180deg, #10b981, #059669);
      color: #fff;
      box-shadow: 0 8px 20px -8px rgba(16,185,129,0.6);
    }

    @keyframes confirm-fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes confirm-pop-in {
      from { opacity: 0; transform: translateY(10px) scale(0.96); }
      to   { opacity: 1; transform: translateY(0)    scale(1); }
    }

    /* Mobile: give cards a bit more breathing room */
    @media (max-width: 480px) {
      .confirm-card { padding: 20px 18px 18px; border-radius: 16px; }
      .confirm-title { font-size: 17.5px; }
      .choice-card { padding: 12px; gap: 12px; }
      .choice-icon { width: 32px; height: 32px; }
    }
  `],
})
export class ConfirmDialogComponent {
  private readonly svc = inject(ConfirmService);

  readonly req = this.svc.state;
  readonly titleId = 'confirm-title-' + Math.random().toString(36).slice(2, 8);
  readonly bodyId  = 'confirm-body-'  + Math.random().toString(36).slice(2, 8);

  readonly canConfirm = computed(() => {
    const s = this.req();
    if (!s) return false;
    if (s.requireText) return s.typed === s.requireText;
    return true;
  });

  onTyped(v: string): void { this.svc.setTyped(v); }

  onAccept(): void { this.svc.accept(); }

  onPickChoice(key: string): void { this.svc.pickChoice(key); }

  onCancel(): void { this.svc.cancel(); }

  onBackdrop(): void {
    // Backdrop click cancels — matches common dialog UX.
    this.svc.cancel();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.req()) this.svc.cancel();
  }
}
