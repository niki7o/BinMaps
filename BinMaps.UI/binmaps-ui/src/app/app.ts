import { Component, signal } from '@angular/core';
import { RouterOutlet, RouterModule, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';

import { Header } from './header/header';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterModule, Header, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('binmaps-ui');
  isMapPage = false;

  constructor(private router: Router) {
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        this.isMapPage = event.url === '/map' || event.url.startsWith('/map?');
      });
  }

  isMapRoute(): boolean {
    return this.router.url === '/map' || this.router.url.startsWith('/map?') || this.router.url.startsWith('/map/');
  }
}