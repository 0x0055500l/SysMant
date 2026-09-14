'use strict';

class AzureTransportError extends Error {
  constructor(code, httpStatus = null) {
    super(code);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

async function postAzure({ endpoint, key, timeoutMs, payload, signal, fetchImpl = fetch }) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      redirect: 'manual',
      signal: combined,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': key,
        'Idempotency-Key': `${payload.estacion_id}:${payload.paquete_uuid}`,
      },
      body: JSON.stringify(payload),
    });
    // No se procesan textos remotos ni se registran respuestas que puedan contener secretos.
    await response.body?.cancel();
    if (![200, 201].includes(response.status)) throw new AzureTransportError(`AZURE_HTTP_${response.status}`, response.status);
    return { httpStatus: response.status, processed: payload.alertas_criticas.length };
  } catch (error) {
    if (error instanceof AzureTransportError) throw error;
    if (signal?.aborted) throw new AzureTransportError('AZURE_CANCELLED');
    if (timeout.aborted || error.name === 'TimeoutError') throw new AzureTransportError('AZURE_TIMEOUT');
    const code = error.cause?.code ?? error.code;
    const safe = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'];
    throw new AzureTransportError(safe.includes(code) ? `AZURE_${code}` : 'AZURE_NETWORK_ERROR');
  }
}

module.exports = { postAzure, AzureTransportError };
