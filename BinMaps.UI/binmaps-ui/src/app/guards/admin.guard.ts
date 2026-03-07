import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';


export const adminGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated) return router.createUrlTree(['/login']);
  if (auth.isBanned)         return router.createUrlTree(['/banned']);
  if (auth.hasRole('Admin')) return true;

  return router.createUrlTree(['/forbidden']);
};
