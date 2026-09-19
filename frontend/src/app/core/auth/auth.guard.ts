import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { safeReturnUrl } from './session.utils';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.hasValidSession()) return true;
  return inject(Router).createUrlTree(['/login'], {
    queryParams: { returnUrl: safeReturnUrl(state.url) },
  });
};

export const guestGuard: CanActivateFn = () => inject(AuthService).hasValidSession()
  ? inject(Router).createUrlTree(['/dashboard']) : true;
