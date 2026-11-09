import { afterEach, beforeEach, vi } from 'vitest';

/**
 * The moment the saved feeds were current: Friday 6 November 2026, 21:00 UTC,
 * a few minutes after they were captured.
 */
export const FEEDS_CAPTURED = '2026-11-06T21:00:00.000Z';

/**
 * Freezes Date at `iso` for every test in the file. Only Date is faked:
 * timers still run, so the app, MSW and user-event behave normally.
 *
 * @param {string} [iso]
 */
export function freezeTime(iso = FEEDS_CAPTURED) {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(iso), toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });
}
