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

          <div class="confirm-icon" [attr.data-variant]="s.variant ?? 'info'" aria-hidden="true">
            @switch (s.variant) {
              @case ('danger')  { <span>⚠</span> }
              @case ('warning') { <span>!</span> }
              @default          { <span>?</span> }
            }
          </div>

          <h2 class="confirm-title" [id]="titleId">{{ s.title }}</h2>

          <p class="confirm-message" [id]="bodyId">{{ s.message }}</p>

          @if (s.detail) {
            <p class="confirm-detail">{{ s.detail }}</p>
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

          <div class="confirm-actions">
            @if (s.cancelText) {
              <button
                type="button"
                class="confirm-btn confirm-btn--ghost"
                (click)="onCancel()">
                {{ s.cancelText }}
              </button>
            }
            <button
              type="button"
              class="confirm-btn"
              [attr.data-variant]="s.variant ?? 'info'"
              [disabled]="!canConfirm()"
              (click)="onAccept()">
              {{ s.confirmText }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { position: fixed; inset: 0; pointer-events: none; z-index: 1100; }

    .confirm-backdrop {
      position: fixed; inset: 0;
      background: rgba(5, 15, 22, 0.72);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
      pointer-events: auto;
      animation: confirm-fade-in 140ms ease-out;
    }

    .confirm-card {
      width: 100%; max-width: 440px;
      background: linear-gradient(180deg, #0f2a30 0%, #0a1f24 100%);
      border: 1px solid rgba(16, 185, 129, 0.18);
      border-radius: 14px;
      padding: 28px 28px 22px;
      box-shadow:
        0 30px 60px -20px rgba(0, 0, 0, 0.7),
        0 0 0 1px rgba(255, 255, 255, 0.03) inset;
      color: #e2e8f0;
      animation: confirm-pop-in 180ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .confirm-card[data-variant="danger"]  { border-color: rgba(239, 68, 68, 0.35); }
    .confirm-card[data-variant="warning"] { border-color: rgba(245, 158, 11, 0.35); }

    .confirm-icon {
      width: 44px; height: 44px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; font-weight: 700;
      margin-bottom: 14px;
    }
    .confirm-icon[data-variant="danger"] {
      background: rgba(239, 68, 68, 0.12); color: #fca5a5;
      box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.08);
    }
    .confirm-icon[data-variant="warning"] {
      background: rgba(245, 158, 11, 0.12); color: #fcd34d;
      box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.08);
    }
    .confirm-icon[data-variant="info"] {
      background: rgba(16, 185, 129, 0.12); color: #6ee7b7;
      box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.08);
    }

    .confirm-title {
      margin: 0 0 8px 0;
      font-size: 19px; font-weight: 600;
      letter-spacing: -0.01em;
      color: #f1f5f9;
    }
    .confirm-message {
      margin: 0;
      font-size: 14.5px;
      line-height: 1.5;
      color: #cbd5e1;
    }
    .confirm-detail {
      margin: 8px 0 0 0;
      font-size: 12.5px;
      color: #94a3b8;
    }

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
      padding: 9px 12px;
      background: #0a1f24;
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 8px;
      color: #e2e8f0;
      font: inherit;
      outline: none;
      transition: border-color 140ms;
    }
    .confirm-require-input:focus { border-color: rgba(16, 185, 129, 0.6); }

    .confirm-actions {
      display: flex; gap: 10px; justify-content: flex-end;
      margin-top: 22px;
    }
    .confirm-btn {
      padding: 9px 18px;
      border-radius: 8px;
      border: 1px solid transparent;
      font: inherit; font-weight: 600; font-size: 13.5px;
      cursor: pointer;
      transition: transform 90ms, filter 140ms, background 140ms;
    }
    .confirm-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .confirm-btn:not(:disabled):hover { filter: brightness(1.08); }
    .confirm-btn:not(:disabled):active { transform: translateY(1px); }

    .confirm-btn--ghost {
      background: transparent;
      color: #cbd5e1;
      border-color: rgba(148, 163, 184, 0.25);
    }
    .confirm-btn[data-variant="danger"]  { background: #dc2626; color: #fff; }
    .confirm-btn[data-variant="warning"] { background: #d97706; color: #fff; }
    .confirm-btn[data-variant="info"]    { background: #059669; color: #fff; }

    @keyframes confirm-fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes confirm-pop-in {
      from { opacity: 0; transform: translateY(8px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0)   scale(1); }
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
