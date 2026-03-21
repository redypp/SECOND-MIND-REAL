/**
 * App Supabase Client — lock: false edition
 *
 * This is the client used by all app code (contexts, hooks, pages).
 * It is identical to the auto-generated client.ts but with `lock: false`
 * in the auth config, which disables Navigator.locks and uses an in-memory
 * mutex instead. This eliminates the "LockManager lock timed out" errors
 * that cause 10-second hangs on startup.
 *
 * The auto-generated src/integrations/supabase/client.ts is NOT modified.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Derived from the Supabase project URL — single source of truth for the auth storage key
const supabaseProjectId = new URL(SUPABASE_URL).hostname.split('.')[0];
export const SUPABASE_AUTH_STORAGE_KEY = `sb-${supabaseProjectId}-auth-token`;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    // Bypass Navigator.locks entirely — pass lock function that just executes
    // the callback directly (no-op lock). This is safe for single-tab web apps
    // and prevents the 10-second timeout that occurs when multiple systems
    // (initializeAuth, onAuthStateChange, sessionMonitor) compete for the lock.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    lock: <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => fn(),
  },
});
