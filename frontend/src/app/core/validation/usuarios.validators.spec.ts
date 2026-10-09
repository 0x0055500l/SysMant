import { FormControl, FormGroup } from '@angular/forms';
import { confirmarPasswordValidator, correoUsuarioValidator, nombreUsuarioValidator, passwordUsuarioValidator } from './usuarios.validators';

describe('Validadores de registro compatibles con Zod', () => {
  it('cuenta Unicode por caracteres y bytes sin truncar ni imponer composición arbitraria', () => {
    expect(passwordUsuarioValidator(new FormControl('a'.repeat(14)))).not.toBeNull();
    expect(passwordUsuarioValidator(new FormControl('a'.repeat(15)))).toBeNull();
    expect(passwordUsuarioValidator(new FormControl('a'.repeat(72)))).toBeNull();
    expect(passwordUsuarioValidator(new FormControl('a'.repeat(73)))).not.toBeNull();
    expect(passwordUsuarioValidator(new FormControl('🔧'.repeat(18)))).toBeNull();
    expect(passwordUsuarioValidator(new FormControl('🔧'.repeat(19)))).not.toBeNull();
    expect(passwordUsuarioValidator(new FormControl('🔧'.repeat(14)))).not.toBeNull();
    expect(passwordUsuarioValidator(new FormControl(' Frase de acceso local '))).toBeNull();
  });
  it('valida correo, nombre sin controles y confirmación', () => {
    expect(correoUsuarioValidator(new FormControl(' ANA@EXAMPLE.COM '))).toBeNull();
    for (const value of ['ana', '.ana@example.com', 'a..b@example.com']) expect(correoUsuarioValidator(new FormControl(value))).not.toBeNull();
    expect(nombreUsuarioValidator(new FormControl('  Ana Torres  '))).toBeNull();
    expect(nombreUsuarioValidator(new FormControl('Ana\u0000Torres'))).not.toBeNull();
    expect(nombreUsuarioValidator(new FormControl('   '))).not.toBeNull();
    const form = new FormGroup({ password: new FormControl('abc'), confirmar: new FormControl('abcd') });
    expect(confirmarPasswordValidator(form)).toEqual({ confirmacion: true });
  });
});
