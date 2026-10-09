import { ValidatorFn } from '@angular/forms';

export const nombreUsuarioValidator: ValidatorFn = ({ value }) => typeof value === 'string'
  && value.trim().length >= 1 && value.trim().length <= 120 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value.trim()) ? null : { nombre: true };

// Compatible con z.email() del servidor; se normaliza el correo, nunca la contraseña.
export const correoUsuarioValidator: ValidatorFn = ({ value }) => typeof value === 'string' && value.trim().length <= 254
  && /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/.test(value.trim()) ? null : { correo: true };

export const passwordUsuarioValidator: ValidatorFn = ({ value }) => typeof value === 'string' && Array.from(value).length >= 15
  && value.length <= 72 && new TextEncoder().encode(value).length <= 72 ? null : { passwordSegura: true };

export const confirmarPasswordValidator: ValidatorFn = ({ value }) => value.password === value.confirmar ? null : { confirmacion: true };
