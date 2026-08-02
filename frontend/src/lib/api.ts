import { getUserMessage, type MessageContext } from './userMessages';
import type { Language } from '../types';

const TOKEN_KEY = 'kumbuka_token';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export function getApiBaseUrl(): string {
  return API_BASE;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiClientError extends Error {
  constructor(
    readonly code: 'network' | 'misconfigured' | 'not_json' | 'unknown',
    readonly status = 0,
    message?: string
  ) {
    super(message ?? code);
    this.name = 'ApiClientError';
  }
}

interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  auth?: boolean;
  language?: Language;
  messageContext?: MessageContext;
}

export interface ApiResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
  error?: string;
}

async function parseResponseBody<T>(response: Response): Promise<T> {
  const text = await response.text();
  const trimmed = text.trim();

  if (
    trimmed.toLowerCase().startsWith('<!doctype') ||
    trimmed.toLowerCase().startsWith('<html')
  ) {
    throw new ApiClientError(
      'misconfigured',
      response.status || 502,
      'Received HTML instead of JSON — API URL may be misconfigured'
    );
  }

  if (!trimmed) {
    return {} as T;
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new ApiClientError('not_json', response.status, 'Invalid JSON response from server');
  }
}

function resolveErrorMessage<T extends { error?: string }>(
  response: Response,
  data: T,
  options: ApiOptions
): string {
  const language = options.language ?? 'en';
  return getUserMessage({
    language,
    status: response.status,
    serverError: data?.error,
    context: options.messageContext ?? 'general',
    code:
      response.status === 405
        ? 'misconfigured'
        : undefined,
  });
}

export async function api<T = unknown>(
  path: string,
  options: ApiOptions = {}
): Promise<ApiResult<T>> {
  const { body, auth = true, language, messageContext, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    ...(customHeaders as Record<string, string>),
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (auth) {
    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...rest,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    return {
      ok: false,
      status: 0,
      data: {} as T,
      error: getUserMessage({
        language: language ?? 'en',
        context: messageContext,
        code: 'network',
      }),
    };
  }

  let data: T;

  try {
    data = await parseResponseBody<T>(response);
  } catch (err) {
    const code = err instanceof ApiClientError ? err.code : 'unknown';
    return {
      ok: false,
      status: err instanceof ApiClientError ? err.status : 0,
      data: {} as T,
      error: getUserMessage({
        language: language ?? 'en',
        status: err instanceof ApiClientError ? err.status : undefined,
        context: messageContext,
        code: code === 'unknown' ? 'network' : code,
      }),
    };
  }

  if (response.status === 401 && auth) {
    clearToken();
  }

  if (!response.ok) {
    const errorBody = data as { error?: string };
    return {
      ok: false,
      status: response.status,
      data,
      error: resolveErrorMessage(response, errorBody, options),
    };
  }

  return { ok: true, status: response.status, data };
}

export async function apiGet<T = unknown>(
  path: string,
  auth = true,
  language: Language = 'en',
  messageContext: MessageContext = 'general'
) {
  return api<T>(path, { method: 'GET', auth, language, messageContext });
}

export async function apiPost<T = unknown>(
  path: string,
  body?: unknown,
  auth = true,
  language: Language = 'en',
  messageContext: MessageContext = 'general'
) {
  return api<T>(path, { method: 'POST', body, auth, language, messageContext });
}
