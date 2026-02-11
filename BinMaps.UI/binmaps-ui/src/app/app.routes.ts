import { Routes } from '@angular/router';
import { LoginComponent } from './login/login'; 
import { RegisterComponent } from './register/register';
import { MapComponent } from './map/map'; 
import { HomeComponent } from './home/home';
import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard';
import { AnalyticsDashboardComponent } from './bin-details/analytics-dashboard.component';
import { Header } from './header/header';
import { ProfileComponent } from './profile.component/profile.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  {path: '', component:HomeComponent},
  { path: 'map', component: MapComponent }, 
  {path: 'admin', component: AdminDashboardComponent},
   { path: 'analytics', component: AnalyticsDashboardComponent },
   {path:'profile', component:ProfileComponent},
  { path: '**', redirectTo: '' } 
];