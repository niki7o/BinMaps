import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, tap } from 'rxjs';

export interface AuthUser {
  id?: string;
  userName?: string;
  name?: string;
  email: string;
  role: string;
  reputation?: number;
  token?: string;
}

interface LoginResponse {
  token: string;
  userName: string;
  email: string;
  role: string;
  userId?: string;
  reputation?: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly API_URL = 'https://localhost:7277/api';

  private _user$ = new BehaviorSubject<AuthUser | null>(this.loadUser());
  readonly currentUser$ = this._user$.asObservable();

  readonly currentUser = signal<AuthUser | null>(this.loadUser());
  readonly isLoggedIn  = signal<boolean>(!!this.loadToken());

  get role(): string { return this._user$.value?.role ?? ''; }

  constructor(private http: HttpClient, private router: Router) {}

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.API_URL}/auth/login`, { email, password }).pipe(
      tap(res => this.persist(res))
    );
  }

  register(userName: string, email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.API_URL}/auth/register`, { userName, email, password }).pipe(
      tap(res => this.persist(res))
    );
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this._user$.next(null);
    this.currentUser.set(null);
    this.isLoggedIn.set(false);
    this.router.navigate(['/']);
  }

  getToken(): string | null {
    const direct = localStorage.getItem('token');
    if (direct) return direct;
    try {
      return JSON.parse(localStorage.getItem('user') ?? '{}').token ?? null;
    } catch { return null; }
  }

  getAuthHeaders(): { headers: HttpHeaders } {
    return {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.getToken()}`
      })
    };
  }

  getFormHeaders(): { headers: HttpHeaders } {
    return {
      headers: new HttpHeaders({ Authorization: `Bearer ${this.getToken()}` })
    };
  }

  private persist(res: LoginResponse): void {
    const user: AuthUser = {
      id: res.userId, userName: res.userName, name: res.userName,
      email: res.email, role: res.role, reputation: res.reputation, token: res.token
    };
    localStorage.setItem('token', res.token);
    localStorage.setItem('user', JSON.stringify(user));
    this._user$.next(user);
    this.currentUser.set(user);
    this.isLoggedIn.set(true);
  }

  private loadToken(): string | null { return localStorage.getItem('token'); }

  private loadUser(): AuthUser | null {
    try { const r = localStorage.getItem('user'); return r ? JSON.parse(r) : null; }
    catch { return null; }
  }
}