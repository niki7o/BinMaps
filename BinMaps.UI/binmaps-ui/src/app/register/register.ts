import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

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
    private readonly fb: FormBuilder,
    private readonly router: Router,
    private readonly auth: AuthService
  ) {
    this.registerForm = this.fb.group({
      userName:        ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50)]],
      email:           ['', [Validators.required, Validators.email]],
      phoneNumber:     ['', [Validators.pattern(/^(\+359|0)[0-9]{9}$/)]],
      password:        ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required],
      acceptTerms:     [false, Validators.requiredTrue]
    }, { validators: this.passwordMatchValidator });
  }

  get userNameControl()        { return this.registerForm.get('userName'); }
  get emailControl()           { return this.registerForm.get('email'); }
  get phoneNumberControl()     { return this.registerForm.get('phoneNumber'); }
  get passwordControl()        { return this.registerForm.get('password'); }
  get confirmPasswordControl() { return this.registerForm.get('confirmPassword'); }

  togglePasswordVisibility(): void { this.showPassword = !this.showPassword; }
  navigateToLogin(): void          { this.router.navigate(['/login']); }

  onSubmit(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isLoading      = true;
    this.generalError   = null;
    this.successMessage = null;

    const payload = {
      userName:    this.registerForm.value.userName,
      email:       this.registerForm.value.email,
      phoneNumber: this.registerForm.value.phoneNumber || null,
      password:    this.registerForm.value.password,
      acceptTerms: this.registerForm.value.acceptTerms
    };

    this.auth.register(payload).subscribe({
      next: (response) => {
        this.isLoading      = false;
        this.successMessage = response.message || 'Успешна регистрация! Пренасочване към входа...';
        sessionStorage.setItem('welcomeUser', '1');
        setTimeout(() => this.router.navigate(['/login']), 2000);
      },
      error: (err) => {
        this.isLoading = false;

        if (err.status === 400 && err.error?.errors) {
          const errors = err.error.errors;

          if (Array.isArray(errors)) {
            this.generalError = errors[0] || 'Грешка при регистрацията.';
            return;
          }

          if (errors.userName) {
            this.userNameControl?.setErrors({ serverError: errors.userName[0] });
          }
          if (errors.email) {
            this.emailControl?.setErrors({ serverError: errors.email[0] });
          }
          if (!errors.userName && !errors.email) {
            this.generalError = 'Грешка при регистрацията.';
          }
          return;
        }

        this.generalError = err.status === 0
          ? 'Не може да се свърже със сървъра. Проверете връзката.'
          : 'Сървърна грешка. Опитайте по-късно.';
      }
    });
  }

  private passwordMatchValidator(control: AbstractControl) {
    const password = control.get('password')?.value;
    const confirm  = control.get('confirmPassword')?.value;
    return password === confirm ? null : { passwordMismatch: true };
  }
}
