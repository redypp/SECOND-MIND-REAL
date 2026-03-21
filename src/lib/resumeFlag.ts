/**
 * Tracks whether the app just resumed from background.
 * Used to trigger one-time actions (e.g. re-center canvas) on next navigation.
 */

let didResume = false;
let backgroundedAt: number | null = null;

const RESUME_THRESHOLD_MS = 20_000; // 20 seconds

function onHidden() {
  backgroundedAt = Date.now();
}

function onVisible() {
  if (backgroundedAt && Date.now() - backgroundedAt >= RESUME_THRESHOLD_MS) {
    didResume = true;
  }
}

function handleVisibility() {
  if (document.visibilityState === 'hidden') onHidden();
  else if (document.visibilityState === 'visible') onVisible();
}

// Auto-init
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', handleVisibility);
}

/** Returns true once after a qualifying resume, then resets. */
export function consumeResumeFlag(): boolean {
  if (didResume) {
    didResume = false;
    return true;
  }
  return false;
}
