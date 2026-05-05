import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, distinctUntilChanged, tap } from 'rxjs';
import { AuthUser, LoginResponse, RegisterRequest } from './auth.models';
import { AuthStorageService } from './auth-storage.service';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private static readonly API = environment.apiUrl;

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
  get isAuthenticated(): boolean { return !!this._state$.value; }
  get isBanned(): boolean { return this._state$.value?.isBanned === true; }

  getToken(): string | null {
    return this._state$.value?.token ?? null;
  }

  hasRole(role: string): boolean {
    return this._state$.value?.role === role;
  }

  getAuthHeaders(): { headers: HttpHeaders } {
    const token = this.getToken();
    return {
      headers: new HttpHeaders({
        Authorization: token ? `Bearer ${token}` : ''
      })
    };
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${AuthService.API}/auth/login`, { email, password })
      .pipe(tap(r => this.applyResponse(r, email)));
  }

  /**
   * Fetches a fresh JWT from the server and updates the stored user state.
   * Call this after an admin changes a user's role, or on profile load, so
   * the UI always reflects what is actually in the database.
   * Preserves the existing profilePicturePath (not carried in the token).
   */
  refreshRole(): void {
    const token = this.getToken();
    if (!token) return;

    this.http
      .get<LoginResponse>(`${AuthService.API}/auth/me`, {
        headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
      })
      .subscribe({
        next: r => {
          const current = this.currentUser;
          this.applyResponse(r, current?.email ?? r.email ?? '');
          // Preserve profile picture — not in the JWT payload.
          const updated = this._state$.value;
          if (updated && current?.profilePicturePath) {
            const withPic = { ...updated, profilePicturePath: current.profilePicturePath };
            this.storage.save(withPic);
            this._state$.next(withPic);
          }
        },
        error: () => { /* swallow — keep existing token */ },
      });
  }

  register(data: RegisterRequest): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${AuthService.API}/auth/register`, data);
  }

  logout(): void {
    this.storage.clear();
    this._state$.next(null);
  }

  updateProfilePicture(path: string | null) {
    const current = this.currentUser;
    if (current) {
      this._state$.next({
        ...current,
        profilePicturePath: path
      });
      const stored = this.storage.load();
      if (stored) {
        this.storage.save({ ...stored, profilePicturePath: path });
      }
    }
  }

  private applyResponse(r: LoginResponse, email: string): void {
    if (!r?.token) return;

    const user: AuthUser = {
      id: r.id ?? r.userId ?? '',
      userName: r.userName ?? r.username ?? email.split('@')[0],
      email: r.email ?? email,
      role: r.role ?? 'User',
      token: r.token,
      profilePicturePath: null,
      isBanned: r.isBanned ?? false,
      banReason: r.banReason ?? null
    };

    this.storage.save(user);
    this._state$.next(user);
  }
}