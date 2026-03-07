import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-banned',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './banned.html',
  styleUrls: ['./banned.css']
})
export class BannedComponent implements OnInit {
  banReason = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly auth: AuthService
  ) {}

  ngOnInit(): void {
    this.banReason = this.route.snapshot.queryParamMap.get('reason')
      ?? 'Профилът ви е блокиран от администратор.';

    // Ensure the user is logged out so they can't bypass the ban page via stored token
    this.auth.logout();
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
