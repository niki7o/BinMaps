
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

    this.http.post<any>('https://localhost:7277/api/auth/login', this.loginForm.value)
      .subscribe({
        next: (res) => {
          localStorage.setItem('user', JSON.stringify(res));
          this.isLoading = false;
          
          if (res.role === 'Admin' || res.role === 'Driver') {
            this.router.navigate(['/map']);
          } else {
            this.router.navigate(['/']);
          }
        },
        error: (err) => {
          this.isLoading = false;

          if (err.status === 400 && err.error?.errors?.email) {
            this.errorMessage = err.error.errors.email[0];
            this.email?.setErrors({ serverError: true });
          } else if (err.status === 0) {
            this.errorMessage = 'Не може да се свърже със сървъра. Моля, проверете връзката.';
          } else {
            this.errorMessage = 'Грешка при влизане. Моля, опитайте отново.';
          }
        }
      });
  }
}
