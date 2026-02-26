import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { LoginComponent } from './login';
import { AuthService } from '../services/auth.service';
import { of } from 'rxjs';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let mockAuthService: jasmine.SpyObj<AuthService>;

  beforeEach(async () => {
    mockAuthService = jasmine.createSpyObj('AuthService', ['login', 'logout', 'getAuthHeaders', 'hasRole'], {
      currentUser$: of(null),
      currentUser: null,
      isAuthenticated: false
    });
    mockAuthService.login.and.returnValue(of({
      token: 'fake', role: 'User', userId: '1', userName: 'test',
      email: 'test@test.com', reputation: 50
    } as any));

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideZoneChangeDetection({ eventCoalescing: true }),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with empty fields', () => {
    expect(component.email()).toBe('');
    expect(component.password()).toBe('');
    expect(component.error()).toBe('');
    expect(component.loading()).toBeFalse();
  });

  it('should toggle password visibility', () => {
    expect(component.showPassword()).toBeFalse();
    component.showPassword.set(true);
    expect(component.showPassword()).toBeTrue();
  });

  it('should not call auth service when loading', () => {
    component.loading.set(true);
    component.submit();
    expect(mockAuthService.login).not.toHaveBeenCalled();
  });
});
