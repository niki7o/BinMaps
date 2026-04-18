import { Routes } from '@angular/router';
import { LoginComponent } from './login/login';
import { RegisterComponent } from './register/register';
import { MapComponent } from './map/map';
import { HomeComponent } from './home/home';
import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard';
import { AddContainerComponent } from './add-container/add-container';
import { RequestContainerComponent } from './request-container/request-container';
import { AnalyticsDashboardComponent } from './bin-details/analytics-dashboard.component';
import { ProfileComponent } from './profile.component/profile.component';
import { AboutComponent } from './about/about';
import { ErrorPageComponent } from './error-Page/error-page.component';
import { TermsComponent } from './terms/terms';
import { NotificationsComponent } from './notifications/notifications';
import { BannedComponent } from './banned/banned';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'banned', component: BannedComponent },
  { path: 'terms', component: TermsComponent },
  { path: 'about',component: AboutComponent },
  { path: 'map', component: MapComponent, canActivate: [authGuard] },
  { path: 'analytics', component: AnalyticsDashboardComponent,  canActivate: [authGuard] },
  { path: 'profile',  component: ProfileComponent, canActivate: [authGuard] },
  { path: 'notifications', component: NotificationsComponent,  canActivate: [authGuard] },
  { path: 'admin', component: AdminDashboardComponent,canActivate: [adminGuard] },
  { path: 'admin/add-container', component: AddContainerComponent, canActivate: [adminGuard] },
  { path: 'request-container', component: RequestContainerComponent, canActivate: [authGuard] },
  { path: 'forbidden',   component: ErrorPageComponent, data: { type: '403' } },
  { path: 'home', redirectTo: '' },
  { path: '**',component: ErrorPageComponent, data: { type: '404' } },
];
