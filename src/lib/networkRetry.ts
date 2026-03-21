/**
 * Network Retry Utilities
 * Implements exponential backoff for network requests
 */

import { showErrorPopup } from '@/contexts/ErrorPopupContext';

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (attempt: number, error: unknown) => void;
  silent?: boolean; // Don't show error popup on final failure
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'silent'>> = {
  maxRetries: 3,
  baseDelayMs: 300,
  maxDelayMs: 10000,
  shouldRetry: (error: unknown) => {
    // Never retry aborted requests — the caller intentionally cancelled
    if (error instanceof DOMException && error.name === 'AbortError') return false;

    // NEVER retry LockManager errors — retrying adds more lock contention
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    if (
      lower.includes('lockmanager') ||
      (lower.includes('lock') && lower.includes('timed out')) ||
      lower.includes('aborted')
    ) {
      return false;
    }

    // Retry on network errors and 5xx responses only
    return (
      lower.includes('network') ||
      lower.includes('fetch') ||
      lower.includes('timeout') ||
      /\b5\d{2}\b/.test(message)
    );
  },
};

/**
 * Calculate delay with exponential backoff + jitter
 */
function calculateDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  // Exponential backoff: 500ms, 1s, 2s, 4s...
  const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
  // Add jitter (±25%)
  const jitter = exponentialDelay * (0.75 + Math.random() * 0.5);
  // Cap at max delay
  return Math.min(jitter, maxDelay);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute an async operation with exponential backoff retry
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt <= opts.maxRetries && opts.shouldRetry(error, attempt)) {
        const delay = calculateDelay(attempt, opts.baseDelayMs, opts.maxDelayMs);
        console.warn(
          `[Retry] Attempt ${attempt}/${opts.maxRetries + 1} failed, retrying in ${Math.round(delay)}ms:`,
          error
        );
        opts.onRetry?.(attempt, error);
        await sleep(delay);
      } else {
        break;
      }
    }
  }

  // All retries exhausted
  const errorMessage = lastError instanceof Error ? lastError.message : 'Unknown error';
  console.error(`[Retry] All ${opts.maxRetries + 1} attempts failed:`, lastError);
  
  if (!opts.silent) {
    showErrorPopup(`Operation failed after multiple attempts: ${errorMessage}`);
  }
  
  throw lastError;
}

/**
 * Create a fetch wrapper with retry logic
 */
export function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  retryOptions?: RetryOptions
): Promise<Response> {
  return withRetry(
    async () => {
      const response = await fetch(input, init);
      if (!response.ok && response.status >= 500) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response;
    },
    {
      ...retryOptions,
      shouldRetry: (error, attempt) => {
        // Don't retry client errors (4xx)
        if (error instanceof Error && error.message.includes('4')) {
          return false;
        }
        return DEFAULT_OPTIONS.shouldRetry(error, attempt);
      },
    }
  );
}

/**
 * Wrapper for Supabase operations with retry
 */
export async function supabaseWithRetry<T>(
  operation: () => Promise<{ data: T | null; error: { message: string } | null }>,
  options?: RetryOptions
): Promise<T> {
  return withRetry(
    async () => {
      const result = await operation();
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data as T;
    },
    options
  );
}
