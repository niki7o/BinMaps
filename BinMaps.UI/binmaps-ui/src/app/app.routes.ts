import { Routes } from '@angular/router';
import { LoginComponent } from './login/login';
import { RegisterComponent } from './register/register';
import { MapComponent } from './map/map';
import { HomeComponent } from './home/home';
import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard';
import { AnalyticsDashboardComponent } from './bin-details/analytics-dashboard.component';
import { ProfileComponent } from './profile.component/profile.component';
import { AboutComponent } from './about/about';
import { ErrorPageComponent } from './error-Page/error-page.component';
import { TermsComponent } from './terms/terms';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'map', component: MapComponent },
  { path: 'admin', component: AdminDashboardComponent },
  { path: 'analytics', component: AnalyticsDashboardComponent },
  { path: 'profile', component: ProfileComponent },
  { path: 'home', redirectTo: ''},
  { path: 'terms',     component: TermsComponent },
  { path: 'about', component: AboutComponent },
  { path: '**', component: ErrorPageComponent, data: { type: '404' } },
  { path: 'forbidden', component: ErrorPageComponent, data: { type: '403' } },
  

];
