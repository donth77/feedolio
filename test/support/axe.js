import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * Checks the whole page with axe and fails with a readable list of problems.
 * jsdom has no layout, so colour contrast is checked in a real browser instead.
 */
export async function expectNoAxeViolations() {
  const results = await axe.run(document, {
    rules: { 'color-contrast': { enabled: false } },
  });
  const problems = results.violations.map(
    (violation) => `${violation.id} (${violation.impact}): ${violation.help}`,
  );
  expect(problems, `axe found:\n${problems.join('\n')}`).toEqual([]);
}
