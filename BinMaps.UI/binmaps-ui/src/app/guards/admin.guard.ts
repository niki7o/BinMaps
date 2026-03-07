import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Allows only Admin users.
 * Unauthenticated → /login
 * Authenticated but wrong role → /forbidden (shows 403 page)
 */
export const adminGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated) return router.createUrlTree(['/login']);
  if (auth.hasRole('Admin'))  return true;

  // Authenticated but not Admin → show forbidden page
  return router.createUrlTree(['/forbidden']);
};
