import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<any>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadFromLocalStorage();
  }

  private loadFromLocalStorage() {
    const user = localStorage.getItem('user');
    if (user) this.currentUserSubject.next(JSON.parse(user));
  }

  login(email: string, password: string): Observable<any> {
    return this.http.post<any>('https://localhost:7277/api/Auth/login', { email, password })
      .pipe(
        tap(res => {
          if (res.token) {
            localStorage.setItem('token', res.token);
            localStorage.setItem('user', JSON.stringify(res.user));
            this.currentUserSubject.next(res.user);
          }
        })
      );
  }

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.currentUserSubject.next(null);
  }

  getAuthHeaders(): { headers: HttpHeaders } {
    const token = localStorage.getItem('token');
    return {
      headers: new HttpHeaders({
        Authorization: `Bearer ${token}`
      })
    };
  }

  getCurrentUser() {
    return this.currentUserSubject.value;
  }

  isLoggedIn(): boolean {
    return !!this.getCurrentUser();
  }

  isAdmin(): boolean {
    return this.getCurrentUser()?.role === 'Admin';
  }

  isDriver(): boolean {
    return this.getCurrentUser()?.role === 'Driver';
  }
}
