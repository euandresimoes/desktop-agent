import type { FastifyReply, FastifyRequest } from 'fastify';

export type ErrorSource = 'api' | 'stt-server' | 'tts-server';

export type ErrorPayload = {
  error: string;
  details: string | null;
  requestId: string | null;
  source: ErrorSource;
};

export class AppError extends Error {
  statusCode: number;
  details: string | null;
  source: ErrorSource;

  constructor(input: {
    message: string;
    statusCode?: number;
    details?: string | null;
    source?: ErrorSource;
  }) {
    super(input.message);
    this.name = 'AppError';
    this.statusCode = input.statusCode ?? 500;
    this.details = input.details ?? null;
    this.source = input.source ?? 'api';
  }
}

export function buildErrorPayload(
  error: unknown,
  requestId: string | null,
  fallbackMessage: string,
  source: ErrorSource = 'api'
): ErrorPayload {
  if (error instanceof AppError) {
    return {
      error: error.message,
      details: error.details,
      requestId,
      source: error.source,
    };
  }

  if (error instanceof Error) {
    return {
      error: error.message || fallbackMessage,
      details: error.stack ?? null,
      requestId,
      source,
    };
  }

  return {
    error: fallbackMessage,
    details: typeof error === 'string' ? error : JSON.stringify(error, null, 2),
    requestId,
    source,
  };
}

export function logRouteError(
  request: FastifyRequest,
  context: string,
  error: unknown
) {
  request.log.error(
    {
      context,
      err: error,
      requestId: request.id,
    },
    `${context} failed`
  );
}

export function sendErrorReply(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
  input?: {
    fallbackMessage?: string;
    statusCode?: number;
    source?: ErrorSource;
    context?: string;
  }
) {
  if (input?.context) {
    logRouteError(request, input.context, error);
  }

  const payload = buildErrorPayload(
    error,
    request.id,
    input?.fallbackMessage ?? 'Unexpected server error',
    input?.source ?? 'api'
  );
  const statusCode =
    error instanceof AppError
      ? error.statusCode
      : input?.statusCode ?? 500;

  return reply.status(statusCode).send(payload);
}
