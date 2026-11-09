import { describe, expect, it } from 'vitest';
import { restoreAiSettings } from '../../src/features/ai/aiSettingsSlice.js';
import {
  AiError,
  describeAiError,
  errorForStatus,
  providerMessage,
  scrub,
} from '../../src/features/ai/errors.js';
import { cleanBaseUrl, hostOf, isLocal, maskKey } from '../../src/features/ai/providerInfo.js';
import { estimateTokens, readUsage, recordUsage, resetUsage } from '../../src/features/ai/usage.js';

describe('Provider details', () => {
  it('show only a key’s prefix and last four characters', () => {
    expect(maskKey('sk-ant-api03-abcdefghijklmnop-a1b2')).toBe('sk-ant-…a1b2');
    expect(maskKey('sk-or-v1-0123456789abcdef-e5f6')).toBe('sk-or-…e5f6');
    expect(maskKey('plainkeywithoutprefix9z8y')).toBe('…9z8y');
    expect(maskKey('sk-ant-short')).toBe('••••');
  });

  it('tidy the addresses readers type', () => {
    expect(cleanBaseUrl(' https://llm.example.test/v1/ ')).toBe('https://llm.example.test/v1');
    expect(cleanBaseUrl('http://localhost:11434/v1')).toBe('http://localhost:11434/v1');
    expect(cleanBaseUrl('')).toBeNull();
    expect(cleanBaseUrl('not a server')).toBeNull();
    expect(cleanBaseUrl('ftp://files.example/v1')).toBeNull();
    expect(cleanBaseUrl('https://user:pass@llm.example.test/v1')).toBeNull();
  });

  it('know which addresses are on this computer', () => {
    expect(isLocal('http://localhost:11434/v1')).toBe(true);
    expect(isLocal('http://127.0.0.1:8080/v1')).toBe(true);
    expect(isLocal('http://[::1]:8080/v1')).toBe(true);
    expect(isLocal('https://openrouter.ai/api/v1')).toBe(false);
    expect(hostOf('nonsense')).toBe('');
  });
});

describe('AI errors', () => {
  it('map HTTP statuses', () => {
    expect(errorForStatus(401).code).toBe('auth');
    expect(errorForStatus(403).code).toBe('forbidden');
    expect(errorForStatus(404).code).toBe('not-found');
    expect(errorForStatus(429).code).toBe('rate');
    expect(errorForStatus(529).code).toBe('server');
    expect(errorForStatus(400, 'Bad').detail).toBe('Bad');
    expect(errorForStatus(400).code).toBe('request');
  });

  it('read each provider’s error format', () => {
    expect(providerMessage({ error: { message: 'Anthropic or OpenAI' } })).toBe(
      'Anthropic or OpenAI',
    );
    expect(providerMessage({ error: 'Ollama' })).toBe('Ollama');
    expect(providerMessage({ detail: 'TypeSafe' })).toBe('TypeSafe');
    expect(providerMessage({ detail: [{ msg: 'Field required' }] })).toBe('Field required');
    expect(providerMessage({ message: 'Other' })).toBe('Other');
    expect(providerMessage({ nothing: true })).toBeUndefined();
    expect(providerMessage(null)).toBeUndefined();
  });

  it('never repeat a key', () => {
    const key = 'sk-test-secret-123456';
    expect(scrub(`Incorrect API key provided: ${key}.`, key)).toBe(
      'Incorrect API key provided: [your key].',
    );
    expect(scrub('x'.repeat(250), key)).toHaveLength(200);
    expect(scrub('  ', key)).toBeUndefined();
    expect(scrub(42, key)).toBeUndefined();
    expect(scrub('No key here', null)).toBe('No key here');
  });

  it('explain each problem in plain words (US-98)', () => {
    const anthropic = { label: 'Anthropic', host: 'api.anthropic.com' };
    /** @param {AiError} error @param {object} [where] */
    const say = (error, where = anthropic) => describeAiError(error, { ...anthropic, ...where });

    expect(say(new AiError('auth'))).toBe(
      'The provider rejected this key (401). Check it and paste it again.',
    );
    expect(say(new AiError('forbidden', { detail: 'No access' }))).toBe(
      'Anthropic turned this key down (403). Check what the key is allowed to do. Anthropic said: “No access”',
    );
    expect(say(new AiError('not-found'))).toBe(
      'Nothing answered at api.anthropic.com (404). Check the address.',
    );
    expect(say(new AiError('rate'))).toMatch(/limiting requests right now \(429\)/);
    expect(say(new AiError('server', { status: 529 }))).toBe(
      'Anthropic had a problem (529). Try again in a moment.',
    );
    expect(say(new AiError('server'))).toBe(
      'Anthropic had a problem (error). Try again in a moment.',
    );
    expect(
      say(new AiError('request', { status: 400, detail: 'Your credit balance is too low.' })),
    ).toBe(
      'Anthropic turned the request down (400). Anthropic said: “Your credit balance is too low.”',
    );
    expect(say(new AiError('request'))).toBe('Anthropic turned the request down (error).');
    expect(say(new AiError('refused'))).toBe('The model declined to answer this one.');
    expect(say(new AiError('bad-response'))).toBe(
      'Anthropic sent an answer Feedolio couldn’t read.',
    );
    expect(say(new AiError('aborted'))).toBe('Stopped.');
    expect(say(new AiError('setup'))).toBe('Set up AI in Settings › AI first.');
    expect(say(new AiError('network'))).toMatch(
      /^Couldn’t reach api\.anthropic\.com\. .*\(CORS\)\.$/,
    );
    expect(
      describeAiError(new TypeError('Failed to fetch'), {
        label: 'Ollama',
        host: 'localhost:11434',
        local: true,
      }),
    ).toBe(
      'Couldn’t reach localhost:11434. Ollama must allow this site: set OLLAMA_ORIGINS, restart Ollama, then test again.',
    );
    expect(say(new AiError('network'), { host: 'api.typesafe.ai', decision: 'typesafe' })).toMatch(
      /TypeSafe’s API doesn’t accept requests from other websites yet/,
    );
  });
});

describe('Saved AI settings', () => {
  it('keep only what is still valid', () => {
    expect(
      restoreAiSettings({
        general: {
          provider: 'custom',
          baseUrl: 'https://llm.example.test/v1/',
          model: 'small',
          traits: { effort: 'yes', json: false, maxOutput: 4096 },
        },
        decision: { provider: 'jev-anywhere' },
        features: { actions: false },
        translateTo: 'xx',
        rememberKeys: false,
      }),
    ).toEqual({
      general: {
        provider: 'custom',
        baseUrl: 'https://llm.example.test/v1',
        model: 'small',
        traits: { json: false, maxOutput: 4096 },
      },
      decision: null,
      features: { actions: false, rules: true, catchUp: true },
      translateTo: 'en',
      rememberKeys: false,
    });

    // A fixed provider always uses its own address.
    expect(
      restoreAiSettings({
        general: {
          provider: 'anthropic',
          baseUrl: 'https://elsewhere.example',
          model: 'm',
          traits: null,
        },
        decision: { provider: 'openrouter' },
      }),
    ).toMatchObject({
      general: { provider: 'anthropic', baseUrl: 'https://api.anthropic.com', traits: {} },
      decision: { provider: 'openrouter' },
      rememberKeys: true,
    });

    expect(restoreAiSettings({ general: { provider: 'nope', model: 'm' } }).general).toBeNull();
    expect(
      restoreAiSettings({ general: { provider: 'custom', baseUrl: 'bad', model: 'm' } }).general,
    ).toBeNull();
    expect(restoreAiSettings({ general: { provider: 'openai', model: '' } }).general).toBeNull();
    expect(restoreAiSettings('nonsense').general).toBeNull();
  });
});

describe('Usage this session', () => {
  it('counts requests and tokens, and starts again on reset', () => {
    resetUsage();
    expect(readUsage()).toEqual({ requests: 0, tokensSent: 0, tokensReceived: 0 });
    recordUsage({ tokensSent: 120.4, tokensReceived: 30 });
    recordUsage({ tokensSent: -5 });
    expect(readUsage()).toEqual({ requests: 2, tokensSent: 120, tokensReceived: 30 });
    expect(estimateTokens('12345678')).toBe(2);
    resetUsage();
    expect(readUsage().requests).toBe(0);
  });
});
