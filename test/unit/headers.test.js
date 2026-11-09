import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
const csp = /Content-Security-Policy: (.+)/.exec(headers)?.[1] ?? '';

/** @param {string} name */
const directive = (name) =>
  csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));

describe('Security headers', () => {
  it('allow the inline theme script by its exact hash', () => {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
    expect(scripts).toHaveLength(1);
    const hash = createHash('sha256').update(scripts[0], 'utf8').digest('base64');
    expect(directive('script-src')).toBe(`script-src 'self' 'sha256-${hash}'`);
  });

  it('allow no inline or remote code, frames or plug-ins', () => {
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    expect(directive('default-src')).toBe("default-src 'self'");
    expect(directive('object-src')).toBe("object-src 'none'");
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive('base-uri')).toBe("base-uri 'none'");
    expect(directive('font-src')).toBe("font-src 'self'");
    expect(directive('require-trusted-types-for')).toBe("require-trusted-types-for 'script'");
    expect(directive('trusted-types')).toBe('trusted-types dompurify');
  });

  it('let the browser reach any https AI provider and local servers like Ollama, and nothing else', () => {
    // Readers choose their own AI endpoints, so the policy can't name them;
    // stopping script injection is what keeps keys safe (§7.4).
    expect(directive('connect-src')).toBe(
      "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
    );
  });
});
