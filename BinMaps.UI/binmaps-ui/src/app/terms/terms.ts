import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './terms.html',
  styleUrls: ['./terms.css']
})
export class TermsComponent implements OnInit {
  readonly lastUpdated = '01 март 2026';
  isLoggedIn = false;

  openSections = new Set<string>();

  readonly sections = [
    { id: 's1',  title: 'Нашите услуги' },
    { id: 's2',  title: 'Интелектуална собственост' },
    { id: 's3',  title: 'Регистрация и акаунт' },
    { id: 's4',  title: 'Забранени дейности' },
    { id: 's5',  title: 'Уведомления за контейнери' },
    { id: 's6',  title: 'Мониторинг и данни' },
    { id: 's7',  title: 'Репутационна система' },
    { id: 's8',  title: 'Управляващо право' },
    { id: 's9',  title: 'Промени и прекратяване' },
    { id: 's10', title: 'Лични данни' },
    { id: 's11', title: 'Контакт' },
  ];

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.isLoggedIn = this.auth.isAuthenticated;
  }

  toggle(id: string): void {
    if (this.openSections.has(id)) {
      this.openSections.delete(id);
    } else {
      this.openSections.add(id);
    }
  }

  isOpen(id: string): boolean {
    return this.openSections.has(id);
  }

  goBack(): void {
    this.router.navigate([this.isLoggedIn ? '/map' : '/register']);
  }
}