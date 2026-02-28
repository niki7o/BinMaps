import { Routes } from '@angular/router';
import { LoginComponent } from './login/login';
import { RegisterComponent } from './register/register';
import { MapComponent } from './map/map';
import { HomeComponent } from './home/home';
import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard';
import { AnalyticsDashboardComponent } from './bin-details/analytics-dashboard.component';
import { ProfileComponent } from './profile.component/profile.component';
import { AboutComponent } from './about/about';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'map', component: MapComponent },
  { path: 'admin', component: AdminDashboardComponent },
  { path: 'analytics', component: AnalyticsDashboardComponent },
  { path: 'profile', component: ProfileComponent },
  { path: 'about', component: AboutComponent },
  { path: '**', redirectTo: '' }
];
