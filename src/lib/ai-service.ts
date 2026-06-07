import { getErrorMessage } from '@/lib/errors';
import { sanitizeJsonString } from '@/lib/utils';

export type AiServiceName = 'llm' | 'tts' | 'image' | 'embedding';

export type AiErrorCategory =
  | 'auth'
  | 'configuration'
  | 'network'
  | 'parse'
  | 'provider'
  | 'rate_limit'
  | 'timeout'
  | 'unknown';

interface RunAiTaskOptions {
  service: AiServiceName;
  operation: string;
  timeoutMs?: number;
  retries?: number;
}

export class AiServiceError extends Error {
  service: AiServiceName;
  category: AiErrorCategory;
  operation: string;
  retryable: boolean;
  statusCode?: number;

  constructor(options: {
    service: AiServiceName;
    category: AiErrorCategory;
    operation: string;
    message: string;
    retryable?: boolean;
    statusCode?: number;
  }) {
    super(options.message);
    this.name = 'AiServiceError';
    this.service = options.service;
    this.category = options.category;
    this.operation = options.operation;
    this.retryable = options.retryable ?? false;
    this.statusCode = options.statusCode;
  }
}

function getStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const record = error as { status?: unknown; statusCode?: unknown; code?: unknown };
  const status = record.status ?? record.statusCode ?? record.code;
  return typeof status === 'number' ? status : undefined;
}

function classifyAiError(error: unknown, service: AiServiceName, operation: string): AiServiceError {
  if (error instanceof AiServiceError) return error;

  const message = getErrorMessage(error, 'AI service error');
  const statusCode = getStatusCode(error);
  const lower = message.toLowerCase();

  if (statusCode === 401 || statusCode === 403 || lower.includes('unauthorized') || lower.includes('api key')) {
    return new AiServiceError({ service, operation, category: 'auth', message, statusCode });
  }

  if (statusCode === 429 || lower.includes('rate limit')) {
    return new AiServiceError({ service, operation, category: 'rate_limit', message, statusCode, retryable: true });
  }

  if (statusCode && statusCode >= 500) {
    return new AiServiceError({ service, operation, category: 'provider', message, statusCode, retryable: true });
  }

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return new AiServiceError({ service, operation, category: 'timeout', message, retryable: true });
  }

  if (lower.includes('network') || lower.includes('fetch failed') || lower.includes('econnreset')) {
    return new AiServiceError({ service, operation, category: 'network', message, retryable: true });
  }

  return new AiServiceError({ service, operation, category: 'unknown', message, statusCode });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, service: AiServiceName, operation: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new AiServiceError({
        service,
        operation,
        category: 'timeout',
        message: `${service}:${operation} timed out after ${timeoutMs}ms`,
        retryable: true,
      }));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function runAiTask<T>(
  options: RunAiTaskOptions,
  task: () => Promise<T>,
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const retries = Math.max(0, options.retries ?? 1);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await withTimeout(task(), timeoutMs, options.service, options.operation);
    } catch (error: unknown) {
      const classified = classifyAiError(error, options.service, options.operation);
      if (!classified.retryable || attempt >= retries) {
        throw classified;
      }
      await delay(400 * 2 ** attempt);
    }
  }

  throw new AiServiceError({
    service: options.service,
    operation: options.operation,
    category: 'unknown',
    message: 'AI task failed unexpectedly',
  });
}

export function parseAiJson<T>(raw: string, operation: string): T {
  try {
    return JSON.parse(sanitizeJsonString(raw)) as T;
  } catch (error: unknown) {
    const preview = raw.slice(0, 300).replace(/\s+/g, ' ');
    throw new AiServiceError({
      service: 'llm',
      operation,
      category: 'parse',
      message: `Failed to parse AI JSON for ${operation}: ${getErrorMessage(error)}. Preview: ${preview}`,
    });
  }
}
