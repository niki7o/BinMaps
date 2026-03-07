import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-banned',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './banned.html',
  styleUrls: ['./banned.css']
})
export class BannedComponent implements OnInit {
  banReason = 'Профилът ви е блокиран от администратор.';

  constructor(
    private readonly router: Router,
    private readonly auth: AuthService
  ) {}

  ngOnInit(): void {
    
    const reason = this.auth.currentUser?.banReason;
    if (reason) this.banReason = reason;
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
