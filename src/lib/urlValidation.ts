/**
 * Validates that a URL uses a safe protocol (http: or https:)
 * Prevents XSS attacks via javascript:, data:, or other dangerous URI schemes
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Sanitizes a URL by returning it only if it's valid, otherwise returns undefined
 */
export function sanitizeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return isValidUrl(url) ? url : undefined;
}

/**
 * Safely opens a URL in a new tab if it passes validation
 * Returns true if the URL was opened, false if it was blocked
 */
export function safeOpenUrl(url: string): boolean {
  if (!isValidUrl(url)) {
    console.warn('Blocked potentially dangerous URL:', url);
    return false;
  }

  // Prefer opening in a new tab, but fall back to same-tab navigation
  // (some embedded/preview environments block popups/new tabs).
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) {
    window.location.assign(url);
  }
  return true;
}
