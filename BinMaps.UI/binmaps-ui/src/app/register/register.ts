
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './register.html',
  styleUrls: ['./register.css']
})
export class RegisterComponent {
  registerForm: FormGroup;
  showPassword = false;
  isLoading = false;
  generalError: string | null = null;
  successMessage: string | null = null;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private http: HttpClient
  ) {
    this.registerForm = this.fb.group({
      userName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50)]],
      email: ['', [Validators.required, Validators.email]],
      phoneNumber: ['', [Validators.pattern(/^(\+359|0)[0-9]{9}$/)]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required],
      acceptTerms: [false, Validators.requiredTrue]
    }, { validators: this.passwordMatchValidator });
  }

  get userNameControl() { return this.registerForm.get('userName'); }
  get emailControl() { return this.registerForm.get('email'); }
  get phoneNumberControl() { return this.registerForm.get('phoneNumber'); }
  get passwordControl() { return this.registerForm.get('password'); }
  get confirmPasswordControl() { return this.registerForm.get('confirmPassword'); }

  togglePasswordVisibility() { this.showPassword = !this.showPassword; }
  navigateToLogin() { this.router.navigate(['/login']); }
  navigateToHome() { this.router.navigate(['/']); }

  onSubmit() {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.generalError = null;
    this.successMessage = null;

    const formData = {
      userName: this.registerForm.value.userName,
      email: this.registerForm.value.email,
      phoneNumber: this.registerForm.value.phoneNumber || null,
      password: this.registerForm.value.password,
      acceptTerms: this.registerForm.value.acceptTerms
    };

    this.http.post('https://localhost:7277/api/auth/register', formData).subscribe({
      next: (response: any) => {
        this.isLoading = false;
        this.successMessage = response.message || "Успешна регистрация! Пренасочване към входа...";
        
        setTimeout(() => {
          this.router.navigate(['/']);
        }, 2000);
      },
      error: (err) => {
        this.isLoading = false;

        if (err.status === 400 && err.error?.errors) {
          const errors = err.error.errors;

          // Handle specific field errors
          if (errors.userName) {
            this.userNameControl?.setErrors({
              serverError: errors.userName[0]
            });
          }

          if (errors.email) {
            this.emailControl?.setErrors({
              serverError: errors.email[0]
            });
          }

          if (errors.general) {
            this.generalError = errors.general[0];
          } else if (!errors.userName && !errors.email) {
            this.generalError = 'Възникна грешка при регистрацията.';
          }

          return;
        }

        if (err.status === 0) {
          this.generalError = 'Не може да се свърже със сървъра. Проверете връзката.';
        } else {
          this.generalError = 'Сървърна грешка. Опитайте по-късно.';
        }
      }
    });
  }

  private passwordMatchValidator(control: AbstractControl) {
    const password = control.get('password')?.value;
    const confirm = control.get('confirmPassword')?.value;
    return password === confirm ? null : { passwordMismatch: true };
  }
}
