
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.html',
  styleUrls: ['./header.css']
})
export class HeaderComponent implements OnInit {
  currentUser: any = null;

  constructor(private router: Router, private http: HttpClient) {}

  ngOnInit() {
    this.checkUser();
  }

  checkUser() {
    
    const data = localStorage.getItem('user');
    if (data) {
      this.currentUser = JSON.parse(data);
    } else {
      
      this.getCurrentUser();
    }
  }

  getCurrentUser() {
    this.http.get<any>('https://localhost:7277/api/auth/me').subscribe({
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
    
    
    this.router.navigate(['/login']).then(() => {
      window.location.reload();
    });
  }
}
