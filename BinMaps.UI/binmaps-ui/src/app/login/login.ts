
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.html',
  styleUrls: ['./login.css'],
  imports: [CommonModule, ReactiveFormsModule]
})
export class LoginComponent {
  loginForm: FormGroup;
  showPassword = false;
  isLoading = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder, 
    private router: Router, 
    private http: HttpClient
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  get email() {
    return this.loginForm.get('email');
  }

  get password() {
    return this.loginForm.get('password');
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  navigateToRegister() {
    this.router.navigate(['/register']);
  }

  navigateToHome() {
    this.router.navigate(['/']);
  }

  onSubmit() {
  if (this.loginForm.invalid) {
    this.loginForm.markAllAsTouched();
    return;
  }

  this.isLoading = true;
  this.errorMessage = '';

  this.http.post<any>('https://localhost:7277/api/Auth/login', this.loginForm.value)
    .subscribe({
      next: (res) => {
         localStorage.setItem('token', res.token);
  localStorage.setItem('user', JSON.stringify(res.user));

  this.isLoading = false;

  window.dispatchEvent(new Event('storage'));

  if (res.user.role === 'Admin' || res.user.role === 'Driver') {
    this.router.navigate(['/map']);
  } else {
    this.router.navigate(['/']);
  }},
      error: (err) => {
        this.isLoading = false;

        if (err.status === 400 && err.error?.errors?.email) {
          this.errorMessage = err.error.errors.email[0];
        } else if (err.status === 0) {
          this.errorMessage = 'Не може да се свърже със сървъра. Проверете дали API-то е стартирано.';
        } else {
          this.errorMessage = 'Грешка при влизане. Моля, опитайте отново.';
        }
      }
    });
  }
}
