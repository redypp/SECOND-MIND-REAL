/**
 * Resume Handler v4
 *
 * Two paths when returning from a long background (> BACKGROUND_THRESHOLD):
 *
 * Path A — Healthy DOM (the 99% case):
 *   No overlay, no disruption to the user. Session is validated silently in
 *   the background. If valid → emit data_refetched so data can refresh.
 *   If missing → emit session_missing so the caller can trigger logout.
 *
 * Path B — Unhealthy DOM (iOS WebView process kill, bfcache corruption):
 *   Show "Reconnecting…" overlay immediately. Wait 200ms for WebView to
 *   repaint, then re-check DOM. If still broken → emit soft_reset and
 *   wait for React to re-mount; if still broken after that, hard reload
 *   fires via a 6s safety timer. Once DOM recovers, validate session,
 *   then remove the overlay.
 *
 * Backgrounds under BACKGROUND_THRESHOLD (5 min) are fully transparent —
 * only the keyboard is dismissed. No overlay, no session check.
 */

import { supabase } from '@/integrations/supabase/app-client';

export type ResumeEvent =
  | { type: 'resume_start'; backgroundDuration: number }
  | { type: 'session_ok' }
  | { type: 'session_refreshed' }
  | { type: 'session_missing' }
  | { type: 'data_refetched' }
  | { type: 'resume_done' }
  | { type: 'soft_reset' }
  | { type: 'reload_prompt' };

type ResumeCallback = (event: ResumeEvent) => void;

// --- Config ---
// 5 min: short absences (checking a notification, switching apps briefly)
// are fully transparent and never trigger the reconnect logic.
const BACKGROUND_THRESHOLD_MS = 300_000;
// Wait for WebView to repaint before re-checking DOM health.
const HEALTH_CHECK_DELAY_MS = 200;
// Hard reload if the DOM stays broken after the recovery attempt.
const HARD_RELOAD_MS = 6_000;
// Max time to wait for a Supabase auth call.
const SESSION_TIMEOUT_MS = 4_000;
// Safety: automatically release the lock so it can't stay stuck forever.
const LOCK_AUTO_RELEASE_MS = 10_000;

// --- State ---
let resumeLock = false;
let lockTimer: ReturnType<typeof setTimeout> | null = null;
let backgroundedAt: number | null = null;
let listeners = new Set<ResumeCallback>();
let cleanupFns: (() => void)[] = [];

function log(tag: string, data?: Record<string, unknown>) {
  console.log(`[resume:${tag}]`, data ?? '', `(${new Date().toISOString()})`);
}

function notify(event: ResumeEvent) {
  listeners.forEach(l => { try { l(event); } catch {} });
}

export function onResume(cb: ResumeCallback): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function acquireLock(): boolean {
  if (resumeLock) return false;
  resumeLock = true;
  lockTimer = setTimeout(() => { log('lock_auto_release'); resumeLock = false; }, LOCK_AUTO_RELEASE_MS);
  return true;
}

function releaseLock() {
  resumeLock = false;
  if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

function blurActiveElement() {
  try {
    const el = document.activeElement;
    if (el && el !== document.body) (el as HTMLElement).blur?.();
    // Dismiss iOS keyboard by briefly focusing a hidden input then releasing.
    const tmp = document.createElement('input');
    tmp.style.cssText = 'position:fixed;top:-9999px;opacity:0;pointer-events:none;';
    document.body.appendChild(tmp);
    tmp.focus();
    tmp.blur();
    tmp.remove();
  } catch {}
}

function isDOMHealthy(): boolean {
  try {
    const root = document.getElementById('root');
    if (!root || root.childElementCount === 0) return false;
    if (document.body.clientHeight === 0 || document.body.clientWidth === 0) return false;
    // Probe DOM mutation — detects a killed WebView JS context.
    const probe = document.createElement('div');
    probe.style.display = 'none';
    document.body.appendChild(probe);
    document.body.removeChild(probe);
    return true;
  } catch { return false; }
}

function showReconnectingOverlay() {
  try {
    removeOverlay();
    const overlay = document.createElement('div');
    overlay.id = 'resume-reconnecting-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:99999;
      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
      background:var(--background, #0a0a0a);
      opacity:0;transition:opacity 0.15s ease;
    `;
    const spinner = document.createElement('div');
    spinner.style.cssText = 'width:32px;height:32px;border-radius:50%;border:3px solid var(--muted, #333);border-top-color:var(--primary, #e03e3e);animation:rspin 0.7s linear infinite;';
    const text = document.createElement('p');
    text.style.cssText = 'color:var(--muted-foreground, #999);font-size:13px;margin:0;';
    text.textContent = 'Reconnecting\u2026';
    const style = document.createElement('style');
    style.textContent = '@keyframes rspin{to{transform:rotate(360deg)}}';
    overlay.appendChild(spinner);
    overlay.appendChild(text);
    overlay.appendChild(style);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });
  } catch {}
}

function removeOverlay() {
  try {
    document.getElementById('resume-reconnecting-overlay')?.remove();
  } catch {}
}

/**
 * Validate the Supabase session and silently refresh the token if it is
 * within 2 minutes of expiry. Returns false if no session exists.
 */
async function checkAndRefreshSession(): Promise<boolean> {
  try {
    const { data: { session }, error } = await withTimeout(
      supabase.auth.getSession(),
      SESSION_TIMEOUT_MS,
      'getSession'
    );

    if (error || !session) {
      log('session_missing');
      notify({ type: 'session_missing' });
      return false;
    }

    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
    if (expiresAt > 0 && expiresAt - Date.now() < 120_000) {
      try {
        await withTimeout(supabase.auth.refreshSession(), SESSION_TIMEOUT_MS, 'refreshSession');
        log('session_refreshed');
        notify({ type: 'session_refreshed' });
      } catch {
        // Refresh failed — session may still be usable; proceed optimistically.
        log('refresh_failed_optimistic');
        notify({ type: 'session_ok' });
      }
    } else {
      log('session_ok');
      notify({ type: 'session_ok' });
    }
    return true;
  } catch {
    // Network error — proceed optimistically rather than disrupting the user.
    log('session_check_failed_optimistic');
    notify({ type: 'session_ok' });
    return true;
  }
}

async function handleAppResume(source: string): Promise<void> {
  const now = Date.now();
  const duration = backgroundedAt ? now - backgroundedAt : 0;

  // Short absences are fully transparent — just dismiss any lingering keyboard.
  if (duration > 0 && duration < BACKGROUND_THRESHOLD_MS) {
    log('skip_short', { source, duration });
    blurActiveElement();
    return;
  }

  if (!acquireLock()) {
    log('skip_locked', { source });
    return;
  }

  log('start', { source, duration });
  blurActiveElement();
  notify({ type: 'resume_start', backgroundDuration: duration });

  if (!isDOMHealthy()) {
    // --- Path B: Unhealthy DOM ---
    // Show the overlay immediately and arm a hard-reload safety net.
    showReconnectingOverlay();
    const hardReloadTimer = setTimeout(() => {
      log('hard_reload', { source, duration });
      removeOverlay();
      window.location.reload();
    }, HARD_RELOAD_MS);

    try {
      // Give the WebView time to repaint before rechecking.
      await new Promise(r => setTimeout(r, HEALTH_CHECK_DELAY_MS));

      if (!isDOMHealthy()) {
        log('dom_unhealthy_after_wait');
        notify({ type: 'soft_reset' });
        // Give React a moment to re-mount.
        await new Promise(r => setTimeout(r, 500));
        if (!isDOMHealthy()) {
          log('dom_still_unhealthy');
          releaseLock();
          return; // Hard reload timer fires.
        }
      }

      // DOM recovered — validate session under the overlay.
      const sessionOk = await checkAndRefreshSession();
      clearTimeout(hardReloadTimer);
      removeOverlay();

      if (!sessionOk) {
        // session_missing was emitted; caller handles logout + redirect.
        releaseLock();
        return;
      }
    } catch {
      releaseLock();
      return; // Hard reload timer fires.
    }
  } else {
    // --- Path A: Healthy DOM (the normal case) ---
    // Silent background session check — no overlay, no disruption to the user.
    const sessionOk = await checkAndRefreshSession();
    if (!sessionOk) {
      releaseLock();
      return; // session_missing already emitted.
    }
  }

  log('recovered', { source, duration });
  notify({ type: 'data_refetched' });
  notify({ type: 'resume_done' });
  releaseLock();
}

// --- Event handlers ---

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    backgroundedAt = Date.now();
  } else if (document.visibilityState === 'visible') {
    handleAppResume('visibility');
  }
}

function onPageShow(e: PageTransitionEvent) {
  if (e.persisted) {
    backgroundedAt = backgroundedAt ?? Date.now() - 30_000;
    handleAppResume('pageshow');
  }
}

function onFocus() {
  // Acts as a fallback for environments where visibilitychange is unreliable.
  if (backgroundedAt && document.visibilityState === 'visible') {
    const elapsed = Date.now() - backgroundedAt;
    if (elapsed >= BACKGROUND_THRESHOLD_MS) {
      handleAppResume('focus');
    }
  }
}

function onOnline() {
  log('online_restored');
  if (backgroundedAt) {
    handleAppResume('online');
  }
}

/**
 * Initialize the resume handler — call once at app startup.
 */
export function initResumeHandler(): () => void {
  cleanupFns.forEach(fn => fn());
  cleanupFns = [];

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('focus', onFocus);
  window.addEventListener('online', onOnline);

  cleanupFns = [
    () => document.removeEventListener('visibilitychange', onVisibilityChange),
    () => window.removeEventListener('pageshow', onPageShow),
    () => window.removeEventListener('focus', onFocus),
    () => window.removeEventListener('online', onOnline),
  ];

  return () => {
    cleanupFns.forEach(fn => fn());
    cleanupFns = [];
    listeners.clear();
    releaseLock();
  };
}
