import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MapComponent } from './map/map';
import { RegisterComponent } from './register/register';
import { LoginComponent } from './login/login';
import { registerAppScopedDispatcher } from '@angular/core/primitives/event-dispatch';


@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('binmaps-ui');
}
