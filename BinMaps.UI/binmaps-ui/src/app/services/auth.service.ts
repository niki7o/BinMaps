import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, distinctUntilChanged, tap } from 'rxjs';
import { AuthUser, LoginResponse } from './auth.models';
import { AuthStorageService } from './auth-storage.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private static readonly API = 'https://localhost:7277/api';

  private readonly _state$: BehaviorSubject<AuthUser | null>;
  readonly currentUser$: Observable<AuthUser | null>;

  constructor(
    private readonly http: HttpClient,
    private readonly storage: AuthStorageService
  ) {
    this._state$ = new BehaviorSubject<AuthUser | null>(this.storage.load());
    this.currentUser$ = this._state$.asObservable().pipe(
      distinctUntilChanged((a, b) => a?.token === b?.token)
    );
  }

  get currentUser(): AuthUser | null { return this._state$.value; }
  get isAuthenticated(): boolean     { return !!this._state$.value; }
  getToken(): string | null          { return this._state$.value?.token ?? null; }
  hasRole(role: string): boolean     { return this._state$.value?.role === role; }

  getAuthHeaders() {
    const token = this.getToken();
    if (!token) return {};
    return {
      headers: new HttpHeaders({
        Authorization: `Bearer ${token}`
      })
    };
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${AuthService.API}/auth/login`, { email, password })
      .pipe(tap(r => this.applyResponse(r, email)));
  }

  logout(): void {
    this.storage.clear();
    this._state$.next(null);
  }
 
  private applyResponse(r: LoginResponse, email: string): void {
    if (!r?.token) return;
    const user: AuthUser = {
      id:       r.id       ?? '',
      userName: r.userName ?? r.username ?? email.split('@')[0],
      email:    r.email    ?? email,
      role:     r.role     ?? 'User',
      token:    r.token
    };
    this.storage.save(user);
    this._state$.next(user);
  }
 
}