'use strict';

const { randomUUID } = require('node:crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { config } = require('./config/env');
const { checkConnection } = require('./config/db');
const { AppError } = require('./utils/app-error');
const { apiLimiter, loginIpLimiter, loginAccountLimiter, requireJson } = require('./middlewares/security.middleware');
const { notFound, errorHandler } = require('./middlewares/error.middleware');
const authRoutes = require('./routes/auth.routes');
const equiposRoutes = require('./routes/equipos.routes');
const mantenimientosRoutes = require('./routes/mantenimientos.routes');

const app = express();
app.disable('x-powered-by');
app.disable('etag');
app.set('trust proxy', false);
app.set('query parser', 'simple');
app.use((req, res, next) => {
  req.id = randomUUID();
  res.set('X-Request-ID', req.id);
  res.set('Cache-Control', 'no-store');
  next();
});
app.use(helmet({ strictTransportSecurity: false }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
    return callback(new AppError(403, 'ORIGIN_NOT_ALLOWED', 'El origen de la solicitud no esta permitido.'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  exposedHeaders: ['X-Request-ID', 'RateLimit', 'Retry-After'],
  credentials: false,
  maxAge: 600,
}));
app.use('/api', apiLimiter);
app.use(requireJson);
app.use(express.json({ limit: '32kb', strict: true }));
app.use('/api/auth/login', loginIpLimiter, loginAccountLimiter);

app.get('/api/health', async (req, res) => {
  await checkConnection();
  res.json({ data: { status: 'ok' } });
});
app.use('/api/auth', authRoutes);
app.use('/api/equipos', equiposRoutes);
app.use('/api/mantenimientos', mantenimientosRoutes);
app.use('/api/alertas', require('./routes/alertas.routes'));
app.use('/api/sincronizacion', require('./routes/sincronizacion.routes'));
app.use(notFound);
app.use(errorHandler);

module.exports = { app };
