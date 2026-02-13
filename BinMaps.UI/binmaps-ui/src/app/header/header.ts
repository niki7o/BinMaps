import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { Subject, takeUntil, filter } from 'rxjs';
import { AuthService } from '../auth.service';

export interface User {
  userName: string;
  email: string;
  role: string;
}

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.html',
  styleUrls: ['./header.css']
})
export class Header implements OnInit, OnDestroy {
  currentUser: User | null = null;
  isAdmin = false;
  showUserMenu = false;
  private destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit() {
   
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        this.currentUser = user;
        this.isAdmin = user?.role === 'Admin';
        console.log('Header: User state updated:', user);
      });

 
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
      
        this.showUserMenu = false;
        
       
        const userData = localStorage.getItem('user');
        if (userData && !this.currentUser) {
          try {
            const user = JSON.parse(userData);
            this.authService['currentUserSubject'].next(user);
          } catch (e) {
            console.error('Failed to parse user data', e);
          }
        }
      });

    
    this.loadUserFromStorage();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

 
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.user-menu')) {
      this.showUserMenu = false;
    }
  }

  private loadUserFromStorage() {
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        const user = JSON.parse(userData);
        if (!this.currentUser) {
          this.authService['currentUserSubject'].next(user);
        }
      } catch (e) {
        console.error('Failed to load user from storage', e);
      }
    }
  }

  

  toggleUserMenu() {
    this.showUserMenu = !this.showUserMenu;
  }



  navigateToHome() {
    this.router.navigate(['/']);
    this.showUserMenu = false;
  }

  navigateToMap() {
    this.router.navigate(['/map']);
    this.showUserMenu = false;
  }

  navigateToAnalytics() {
    this.router.navigate(['/analytics']);
    this.showUserMenu = false;
  }

  navigateToAdmin() {
    this.router.navigate(['/admin-dashboard']);
    this.showUserMenu = false;
  }

  navigateToProfile() {
    this.router.navigate(['/profile']);
    this.showUserMenu = false;
  }

  navigateToSettings() {
    this.router.navigate(['/settings']);
    this.showUserMenu = false;
  }

  navigateToLogin() {
    this.router.navigate(['/login']);
    this.showUserMenu = false;
  }

  navigateToRegister() {
    this.router.navigate(['/register']);
    this.showUserMenu = false;
  }

 

  logout() {
    this.authService.logout();
    this.currentUser = null;
    this.showUserMenu = false;
    this.router.navigate(['/']);
  }

 

  getInitials(name: string): string {
    if (!name) return 'U';
    const parts = name.split(' ').filter(p => p.length > 0);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  getRoleLabel(role: string): string {
    const roleLabels: { [key: string]: string } = {
      'Admin': 'Администратор',
      'Driver': 'Шофьор',
      'User': 'Потребител'
    };
    return roleLabels[role] || 'Потребител';
  }
}