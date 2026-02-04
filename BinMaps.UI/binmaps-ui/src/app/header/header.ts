
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.html',
  styleUrls: ['./header.css']
})
export class HeaderComponent implements OnInit, OnDestroy {
  currentUser: any = null;
  private destroy$ = new Subject<void>();

  constructor(private router: Router, private http: HttpClient) {}

  ngOnInit() {
    this.checkUser();
    // Listen for user changes (e.g., after login)
    window.addEventListener('storage', this.handleStorageChange.bind(this));
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    window.removeEventListener('storage', this.handleStorageChange.bind(this));
  }

  handleStorageChange(event: StorageEvent) {
    if (event.key === 'user') {
      this.checkUser();
    }
  }

  checkUser() {
  const data = localStorage.getItem('user');
  if (data) {
    try {
      this.currentUser = JSON.parse(data);
      
      
      if (this.currentUser.userName) {
        
      } 
      else if (this.currentUser.displayName) {

        this.currentUser.userName = this.currentUser.displayName;

      }
       else if (this.currentUser.email) {
   
        this.currentUser.userName = this.currentUser.email.split('@')[0];
      }
      
      localStorage.setItem('user', JSON.stringify(this.currentUser));
    } catch (e) {
      this.currentUser = null;
      localStorage.removeItem('user');
    }
  } else {
    this.currentUser = null;
  }
}


  getCurrentUserFromApi() {
    this.http.get<any>('https://localhost:7277/api/Auth/me')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (user) => {
          this.currentUser = user;
          localStorage.setItem('user', JSON.stringify(user));
        },
        error: () => {
          this.currentUser = null;
          localStorage.removeItem('user');
        }
      });
  }

  logout() {
   
    localStorage.removeItem('user');
    this.currentUser = null;
    
    
    this.router.navigate(['/']).then(() => {
      window.location.reload();
    });
  }
}
