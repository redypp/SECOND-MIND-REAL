/**
 * Performance Logger
 * Tracks timing for key flows and flags slow operations
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface TimingEntry {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'pending' | 'success' | 'error';
  error?: string;
}

const SLOW_THRESHOLD_MS = 1500;
const timings = new Map<string, TimingEntry>();

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function log(level: LogLevel, message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const prefix = `[Perf ${timestamp}]`;
  
  switch (level) {
    case 'debug':
      console.debug(prefix, message, data ?? '');
      break;
    case 'info':
      console.info(prefix, message, data ?? '');
      break;
    case 'warn':
      console.warn(prefix, message, data ?? '');
      break;
    case 'error':
      console.error(prefix, message, data ?? '');
      break;
  }
}

/**
 * Start timing an operation
 */
export function startTiming(name: string): string {
  const id = `${name}_${Date.now()}`;
  timings.set(id, {
    name,
    startTime: performance.now(),
    status: 'pending',
  });
  log('debug', `Started: ${name}`, { id });
  return id;
}

/**
 * End timing an operation successfully
 */
export function endTiming(id: string, details?: string): number {
  const entry = timings.get(id);
  if (!entry) {
    log('warn', `No timing found for id: ${id}`);
    return 0;
  }
  
  entry.endTime = performance.now();
  entry.duration = entry.endTime - entry.startTime;
  entry.status = 'success';
  
  const isSlow = entry.duration > SLOW_THRESHOLD_MS;
  const level: LogLevel = isSlow ? 'warn' : 'info';
  
  log(level, `${isSlow ? '🐢 SLOW: ' : '✓ '}${entry.name} completed in ${formatDuration(entry.duration)}${details ? ` - ${details}` : ''}`, {
    id,
    duration: entry.duration,
    slow: isSlow,
  });
  
  return entry.duration;
}

/**
 * End timing an operation with error
 */
export function endTimingWithError(id: string, error: unknown): void {
  const entry = timings.get(id);
  if (!entry) {
    log('warn', `No timing found for id: ${id}`);
    return;
  }
  
  entry.endTime = performance.now();
  entry.duration = entry.endTime - entry.startTime;
  entry.status = 'error';
  entry.error = error instanceof Error ? error.message : String(error);
  
  log('error', `✗ ${entry.name} failed after ${formatDuration(entry.duration)}: ${entry.error}`, {
    id,
    duration: entry.duration,
    error: entry.error,
  });
}

/**
 * Time an async operation
 */
export async function timeAsync<T>(
  name: string,
  operation: () => Promise<T>,
  details?: string
): Promise<T> {
  const id = startTiming(name);
  try {
    const result = await operation();
    endTiming(id, details);
    return result;
  } catch (error) {
    endTimingWithError(id, error);
    throw error;
  }
}

/**
 * Get summary of all timings
 */
export function getTimingSummary(): { total: number; slow: number; failed: number; entries: TimingEntry[] } {
  const entries = Array.from(timings.values()).filter(e => e.status !== 'pending');
  return {
    total: entries.length,
    slow: entries.filter(e => e.duration && e.duration > SLOW_THRESHOLD_MS).length,
    failed: entries.filter(e => e.status === 'error').length,
    entries,
  };
}

/**
 * Clear all timing data
 */
export function clearTimings(): void {
  timings.clear();
}

/**
 * Log app lifecycle event
 */
export function logLifecycle(event: string, data?: Record<string, unknown>): void {
  log('info', `📱 ${event}`, data);
}
