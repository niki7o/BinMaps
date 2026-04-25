import { Component, signal } from '@angular/core';
import { RouterOutlet, RouterModule, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Header } from './header/header';
import { filter } from 'rxjs/operators';
import { ConfirmDialogComponent } from './shared/confirm-dialog/confirm-dialog.component';
import { ToastHostComponent } from './shared/toast/toast-host.component';

const SHELL_HIDDEN_ROUTES = ['/login', '/register', '/terms', '/banned', '/forbidden'];

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterModule, Header, CommonModule, ConfirmDialogComponent, ToastHostComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('binmaps-ui');

  showShell = true;

  constructor(private readonly router: Router) {
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => {
        this.showShell = !SHELL_HIDDEN_ROUTES.some(r => e.url === r || e.url.startsWith(r + '?') || e.url.startsWith(r + '/'));
      });
  }

  isMapRoute(): boolean {
    const url = this.router.url;
    return url === '/map' || url.startsWith('/map?') || url.startsWith('/map/');
  }
}