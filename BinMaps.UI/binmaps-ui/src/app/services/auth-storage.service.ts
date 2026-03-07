import { Injectable } from '@angular/core';
import { AuthUser } from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthStorageService {

  
  private static readonly KEY   = 'binmaps_user';
  private static readonly LEGACY_KEYS = ['token', 'user'] as const;
 
  load(): AuthUser | null {
    return this.fromKey(AuthStorageService.KEY)
        ?? this.fromKey('user')
        ?? this.fromLegacyToken(localStorage.getItem('token'));
  }
  
  save(user: AuthUser): void {
    localStorage.setItem(AuthStorageService.KEY, JSON.stringify(user));
  }

  clear(): void {
    localStorage.removeItem(AuthStorageService.KEY);
    AuthStorageService.LEGACY_KEYS.forEach(k => localStorage.removeItem(k));
  }
 
  private fromKey(key: string): AuthUser | null {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try   { return JSON.parse(raw) as AuthUser; }
    catch { return null; }
  }

  private fromLegacyToken(token: string | null): AuthUser | null {
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return {
        id: payload.sub ?? '',
        userName: payload.unique_name ?? payload.email ?? '',
        email: payload.email  ?? '',
        role:payload.role ?? 'User',
        token
      };
    } catch { return null; }
  }
  
}