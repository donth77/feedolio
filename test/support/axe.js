import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * Checks the page, or one part of it, with axe and fails with a readable list
 * of problems. jsdom has no layout, so colour contrast is checked in a real
 * browser instead. jsdom also ignores CSS, so layouts hidden at the current
 * width still count; check an open dialog on its own.
 *
 * @param {Document|Element} [context]
 */
export async function expectNoAxeViolations(context = document) {
  const results = await axe.run(context, {
    rules: { 'color-contrast': { enabled: false } },
  });
  const problems = results.violations.map(
    (violation) => `${violation.id} (${violation.impact}): ${violation.help}`,
  );
  expect(problems, `axe found:\n${problems.join('\n')}`).toEqual([]);
}
