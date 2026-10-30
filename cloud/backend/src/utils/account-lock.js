'use strict';
const { AppError } = require('./app-error');
const lockName = 'sysmant.portal.accounts';
async function lockAccounts(connection) {
  const [[row]] = await connection.execute('SELECT GET_LOCK(?, 5) AS acquired', [lockName]);
  if (String(row.acquired) !== '1') throw new AppError(409, 'ACCOUNT_OPERATION_BUSY', 'Otra operacion de cuentas esta en curso.');
}
async function unlockAccounts(connection) {
  const [[row]] = await connection.execute('SELECT RELEASE_LOCK(?) AS released', [lockName]);
  if (String(row.released) !== '1') throw new Error('No fue posible liberar el bloqueo de cuentas.');
}
module.exports = { lockAccounts, unlockAccounts };
