export type ErrorSource = "api" | "stt-server" | "tts-server";

export type HttpErrorPayload = {
  error?: string;
  details?: string | null;
  requestId?: string | null;
  source?: ErrorSource | string;
};

export class AppHttpError extends Error {
  status: number;
  requestId: string | null;
  source: string | null;
  details: string | null;
  payload: HttpErrorPayload | null;

  constructor(input: {
    message: string;
    status: number;
    requestId?: string | null;
    source?: string | null;
    details?: string | null;
    payload?: HttpErrorPayload | null;
  }) {
    super(input.message);
    this.name = "AppHttpError";
    this.status = input.status;
    this.requestId = input.requestId ?? null;
    this.source = input.source ?? null;
    this.details = input.details ?? null;
    this.payload = input.payload ?? null;
  }
}

function buildRequestSuffix(requestId: string | null | undefined) {
  return requestId ? ` (request ${requestId})` : "";
}

export function buildErrorMessage(
  payload: HttpErrorPayload | null,
  fallbackMessage: string,
  status?: number,
) {
  const requestSuffix = buildRequestSuffix(payload?.requestId);
  const sourcePrefix = payload?.source ? `${payload.source}: ` : "";

  if (payload?.error) {
    return `${sourcePrefix}${payload.error}${requestSuffix}`;
  }

  if (typeof status === "number") {
    return `${fallbackMessage} (${status})${requestSuffix}`;
  }

  return `${fallbackMessage}${requestSuffix}`;
}

async function readErrorPayload(response: Response): Promise<HttpErrorPayload | null> {
  const text = await response.text();

  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as HttpErrorPayload;
  } catch {
    return {
      error: text,
      details: text,
      requestId: null,
      source: "api",
    };
  }
}

export async function fetchJsonOrThrow<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  fallbackMessage: string,
): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    const payload = await readErrorPayload(response);

    throw new AppHttpError({
      message: buildErrorMessage(payload, fallbackMessage, response.status),
      status: response.status,
      requestId: payload?.requestId,
      source: payload?.source ?? "api",
      details: payload?.details ?? null,
      payload,
    });
  }

  return (await response.json()) as T;
}
