
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subject, takeUntil } from 'rxjs';
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
    });
}

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

    logout() {
    
 
  this.authService.logout();
  this.router.navigate(['/']);
}
    }
  
