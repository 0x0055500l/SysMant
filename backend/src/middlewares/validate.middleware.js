'use strict';

const { AppError } = require('../utils/app-error');

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || source,
        message: issue.message,
      }));
      return next(new AppError(422, 'VALIDATION_ERROR', 'Los datos enviados no son validos.', details));
    }
    req.validated ??= {};
    req.validated[source] = result.data;
    return next();
  };
}

module.exports = { validate };
