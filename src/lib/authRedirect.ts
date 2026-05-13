/**
 * navigateToAuth — single-flight redirect to /auth.
 *
 * Several systems (AppStartup retry/logout, sessionMonitor token-expired,
 * resumeHandler session-missing) can independently decide to send the user
 * to /auth at the same time. Without coordination, the second redirect can
 * race the first — observed in the wild as a momentary error popup flashing
 * over the auth page, or the URL hopping `/auth → /auth?... → /auth`.
 *
 * This helper enforces idempotency: once any caller has set the redirect in
 * motion, subsequent calls are no-ops until the current tab is replaced.
 * The flag intentionally lives at module scope (not React state) so it
 * persists across components and survives a render. It is never cleared —
 * a real navigation tears down the JS context, which is the natural reset.
 */

let redirectingToAuth = false;

export function navigateToAuth(): void {
  if (redirectingToAuth) return;
  if (typeof window === 'undefined') return;
  // If we're already on /auth, there's nothing to do.
  if (window.location.pathname === '/auth') return;
  redirectingToAuth = true;
  window.location.href = '/auth';
}

/**
 * Test-only escape hatch — clears the in-flight flag.
 *
 * Production code should never call this; the flag is meant to be a
 * write-once latch for the lifetime of the tab.
 */
export function __resetAuthRedirectForTests(): void {
  redirectingToAuth = false;
}
