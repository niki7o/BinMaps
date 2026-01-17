import { Routes } from '@angular/router';
import { LoginComponent } from './login/login'; 
import { RegisterComponent } from './register/register';
import { MapComponent } from './map/map'; 
import { HomeComponent } from './home/home';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  {path: '', component:HomeComponent},
  { path: 'map', component: MapComponent }, 
  { path: '**', redirectTo: '' } 
];