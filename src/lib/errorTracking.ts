/**
 * Sentry — runtime error tracking.
 *
 * No-ops if VITE_SENTRY_DSN is unset. Init is called once from main.tsx
 * before React renders so it can catch boot-time errors.
 */

import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const ENV = (import.meta.env.MODE as string) || 'production';

let initialized = false;

export function initErrorTracking() {
  if (initialized) return;
  if (!DSN) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info('[sentry] VITE_SENTRY_DSN not set — error tracking disabled');
    }
    return;
  }
  Sentry.init({
    dsn: DSN,
    environment: ENV,
    // Conservative defaults — easy to tune later from the Sentry dashboard.
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
  });
  initialized = true;
}

export const errorTracking = {
  identifyUser(userId: string, email?: string) {
    if (!initialized) return;
    Sentry.setUser({ id: userId, email });
  },
  clearUser() {
    if (!initialized) return;
    Sentry.setUser(null);
  },
  captureException(err: unknown, context?: Record<string, unknown>) {
    if (!initialized) {
      // eslint-disable-next-line no-console
      console.error('[errorTracking]', err, context);
      return;
    }
    Sentry.captureException(err, context ? { extra: context } : undefined);
  },
  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
    if (!initialized) return;
    Sentry.captureMessage(message, level);
  },
};
