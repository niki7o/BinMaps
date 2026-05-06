import { Component, OnDestroy, signal } from '@angular/core';
import { RouterOutlet, RouterModule, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Header } from './header/header';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { ConfirmDialogComponent } from './shared/confirm-dialog/confirm-dialog.component';
import { ToastHostComponent } from './shared/toast/toast-host.component';
import { AuthService } from './services/auth.service';
import { ContainerSignalRService } from './services/signalr.service';

const SHELL_HIDDEN_ROUTES = ['/login', '/register', '/terms', '/banned', '/forbidden'];

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterModule, Header, CommonModule, ConfirmDialogComponent, ToastHostComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnDestroy {
  protected readonly title = signal('binmaps-ui');

  showShell = true;
  private authSub?: Subscription;
  private signalRStarted = false;

  constructor(
    private readonly router: Router,
    private readonly auth: AuthService,
    private readonly signalR: ContainerSignalRService,
  ) {
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => {
        this.showShell = !SHELL_HIDDEN_ROUTES.some(r => e.url === r || e.url.startsWith(r + '?') || e.url.startsWith(r + '/'));
      });

    this.authSub = this.auth.currentUser$.subscribe(user => {
      if (user && !this.signalRStarted) {
        this.signalR.start();
        this.signalRStarted = true;
      } else if (!user && this.signalRStarted) {
        this.signalR.stop();
        this.signalRStarted = false;
      }
    });
  }

  ngOnDestroy(): void {
    this.authSub?.unsubscribe();
  }

  isMapRoute(): boolean {
    const url = this.router.url;
    return url === '/map' || url.startsWith('/map?') || url.startsWith('/map/');
  }
}