import { vi } from 'vitest';
import { savedAnswer } from '../fixtures/web.js';

/**
 * @typedef {(request: Request) => Response | Promise<Response>} Answer
 */

/**
 * Stands in for the internet while the Worker runs in these tests. The Worker
 * shares the test's isolate, so replacing fetch here replaces it for the
 * Worker too. Saved copies of real feeds and pages answer by default;
 * `answers` adds or replaces addresses for one test. Anything else fails, as
 * if the network were down.
 *
 * Call vi.restoreAllMocks() after each test.
 *
 * @param {Record<string, Answer>} [answers]
 * @returns {Request[]}  Every request the Worker made, in order
 */
export function fakeInternet(answers = {}) {
  /** @type {Request[]} */
  const requests = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    if (Object.hasOwn(answers, request.url)) return answers[request.url](request);
    const saved = savedAnswer(request.url);
    if (saved) return saved;
    throw new TypeError(`fetch failed: nothing answers ${request.url} in this test`);
  });
  return requests;
}

/**
 * An answer that never arrives: it waits until the Worker gives up.
 *
 * @param {() => void} [onRequest]  Called when the request is made
 * @returns {Answer}
 */
export function never(onRequest) {
  return (request) => {
    onRequest?.();
    return new Promise((_, reject) => {
      request.signal.addEventListener('abort', () => reject(request.signal.reason));
    });
  };
}

/**
 * A body of `bytes` bytes that starts with `start` and is padded with spaces,
 * streamed in 64 KB chunks.
 *
 * @param {string} start
 * @param {number} bytes
 */
export function streamOf(start, bytes) {
  const head = new TextEncoder().encode(start);
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= bytes) return controller.close();
      const size = Math.min(64 * 1024, bytes - sent);
      const chunk = new Uint8Array(size).fill(32);
      if (sent === 0) chunk.set(head.subarray(0, size));
      controller.enqueue(chunk);
      sent += size;
    },
  });
}
