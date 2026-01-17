import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-register',
  standalone: true,
  templateUrl: './register.html',
  styleUrls: ['./register.css'],
  imports: [CommonModule, ReactiveFormsModule]
})
export class RegisterComponent {

  registerForm: FormGroup;

  showPassword = false;
  showConfirmPassword = false;
  isLoading = false;

  errorMessage: string | null = null;
  successMessage: string | null = null;

  constructor(private fb: FormBuilder, private router: Router, private http: HttpClient) {
    this.registerForm = this.fb.group(
      {
        firstName: ['', [Validators.required, Validators.minLength(2)]],
        lastName: ['', [Validators.required, Validators.minLength(2)]],
        email: ['', [Validators.required, Validators.email]],
        phoneNumber: ['', [Validators.pattern(/^\+?[0-9]{9,15}$/)]],
        password: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', Validators.required],
        acceptTerms: [false, Validators.requiredTrue]
      },
      { validators: this.passwordMatchValidator }
    );
  }

  get firstName() { return this.registerForm.get('firstName'); }
  get lastName() { return this.registerForm.get('lastName'); }
  get email() { return this.registerForm.get('email'); }
  get phoneNumber() { return this.registerForm.get('phoneNumber'); }
  get password() { return this.registerForm.get('password'); }
  get confirmPassword() { return this.registerForm.get('confirmPassword'); }
  get acceptTerms() { return this.registerForm.get('acceptTerms'); }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPasswordVisibility() {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  navigateToLogin() {
    this.router.navigate(['/login']);
  }

  navigateToHome() {
    this.router.navigate(['/']);
  }

  onSubmit() {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;

    const body = {
      userName: this.registerForm.value.email, 
      email: this.registerForm.value.email,
      password: this.registerForm.value.password,
      phoneNumber: this.registerForm.value.phoneNumber?.toString(),
      acceptTerms: this.registerForm.value.acceptTerms
    };

    this.http.post('https://localhost:7277/api/auth/register', body)
      .subscribe({
        next: () => {
          this.isLoading = false;
          this.successMessage = 'Регистрацията е успешна! Пренасочване към картата...';
          
          setTimeout(() => this.router.navigate(['/']), 2000); 
        },
        error: (err) => {
          this.isLoading = false;
          this.errorMessage = "Грешка: " + (err.error?.errors?.Password || "Проверете данните");
        }
      });
  }

  private passwordMatchValidator(control: AbstractControl) {
    const password = control.get('password')?.value;
    const confirm = control.get('confirmPassword')?.value;
    return password === confirm ? null : { passwordMismatch: true };
  }
}