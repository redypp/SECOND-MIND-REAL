/**
 * Analytics — thin wrapper over PostHog.
 *
 * No-ops cleanly if VITE_POSTHOG_KEY is unset (e.g. local dev without keys),
 * so existing `analytics.capture(...)` calls scattered through the app stay
 * safe regardless of environment.
 */

import posthog from 'posthog-js';

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com';

let initialized = false;

export function initAnalytics() {
  if (initialized) return;
  if (!KEY) {
    // Silent in production; chatty in dev so it's obvious the key is missing.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info('[analytics] VITE_POSTHOG_KEY not set — analytics disabled');
    }
    return;
  }
  posthog.init(KEY, {
    api_host: HOST,
    capture_pageview: false, // we route ourselves; pageviews fired manually
    persistence: 'localStorage',
    autocapture: false,      // keep events explicit and meaningful
    disable_session_recording: false,
    loaded: () => { initialized = true; },
  });
  initialized = true;
}

export const analytics = {
  /** Tie subsequent events to this user. Safe to call before init. */
  identify(userId: string, traits?: Record<string, unknown>) {
    if (!initialized || !KEY) return;
    posthog.identify(userId, traits);
  },
  /** Wipe identity on sign-out. */
  reset() {
    if (!initialized || !KEY) return;
    posthog.reset();
  },
  /** Track a discrete event. */
  capture(event: string, props?: Record<string, unknown>) {
    if (!initialized || !KEY) return;
    posthog.capture(event, props);
  },
  /** Manual pageview — call from a router effect. */
  pageview(path: string) {
    if (!initialized || !KEY) return;
    posthog.capture('$pageview', { $current_url: path });
  },
};

/** Canonical event names so they don't drift across the app. */
export const Events = {
  AppOpen: 'app_open',
  Signup: 'auth_signup',
  Login: 'auth_login',
  Logout: 'auth_logout',
  OnboardingComplete: 'onboarding_complete',
  PaywallView: 'paywall_view',
  PaywallStartTrial: 'paywall_start_trial',
  PaywallPurchase: 'paywall_purchase',
  PaywallRestore: 'paywall_restore',
  PaywallDismiss: 'paywall_dismiss',
  SubscriptionActive: 'subscription_active',
  AccountDeleted: 'account_deleted',
} as const;
