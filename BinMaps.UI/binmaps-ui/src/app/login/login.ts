import { Component, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth.service';

@Component({
  selector:    'app-login',
  standalone:  true,
  imports:     [CommonModule, RouterModule, FormsModule],
  templateUrl: './login.html',
  styleUrls:   ['./login.css']
})
export class LoginComponent {
  readonly email    = signal('');
  readonly password = signal('');
  readonly error    = signal('');
  readonly loading  = signal(false);
  readonly showPassword = signal(false);
 
  constructor(
    private readonly auth:   AuthService,
    private readonly router: Router
  ) {}
  
  get isLoading(): boolean {
    return this.loading();
  }

  get errorMessage(): string {
    return this.error();
  }

  submit(): void {
    if (!this.email() || !this.password()) {
      this.error.set('Въведете имейл и парола');
      return;
    }
    this.loading.set(true);
    this.error.set('');

    this.auth.login(this.email(), this.password()).subscribe({
      next:  ()  => this.navigateByRole(),
      error: (e) => this.onLoginError(e)
    });
  }
  
  togglePasswordVisibility(): void {
    this.showPassword.update(v => !v);
  }

  navigateToRegister(): void {
    this.router.navigate(['/register']);
  }

  private navigateByRole(): void {
    const destination = this.auth.hasRole('Admin') ? '/admin' : '/map';
    this.router.navigate([destination]);
  }

  private onLoginError(err: { status: number }): void {
    this.loading.set(false);
    this.error.set(
      err.status === 401 || err.status === 400
        ? 'Грешен имейл или парола'
        : 'Грешка при вход. Опитайте отново.'
    );
  }
}