import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { AI_HOSTS, CUSTOM_BASE_URL, seedAi, TEST_KEYS } from '../fixtures/ai.js';
import { server } from '../msw/server.js';
import { expectNoAxeViolations } from '../support/axe.js';
import { freezeTime } from '../support/clock.js';
import { renderApp } from '../support/renderApp.jsx';

freezeTime();

const KEYS_ITEM = 'feedolio:ai-keys:v1';

/** The General model card. */
const generalCard = () => screen.getByRole('region', { name: 'General model' });
/** The Decision model card. */
const decisionCard = () => screen.getByRole('region', { name: 'Decision model' });

/** @param {HTMLElement} card */
const statusIn = (card) => within(card).getByRole('status');

/** Requests to AI providers, as they happen. */
function watchAiRequests() {
  /** @type {string[]} */
  const seen = [];
  const listener = ({ request }) => {
    const { host } = new URL(request.url);
    if (AI_HOSTS.includes(host)) seen.push(`${request.method} ${request.url}`);
  };
  server.events.on('request:start', listener);
  return { seen, stop: () => server.events.removeListener('request:start', listener) };
}

/** What the app saved as the reader's data (never keys). */
function savedData() {
  return JSON.parse(localStorage.getItem('feedolio:v1') ?? '{}');
}

/**
 * Pastes into a field, as readers do with keys.
 *
 * @param {import('@testing-library/user-event').UserEvent} user
 * @param {HTMLElement} field
 * @param {string} value
 */
async function pasteInto(user, field, value) {
  await user.click(field);
  await user.paste(value);
}

/**
 * Connects a general model the way a reader does.
 *
 * @param {import('@testing-library/user-event').UserEvent} user
 * @param {{ provider?: string, key?: string, url?: string }} choice
 */
async function connectGeneral(user, { provider, key, url } = {}) {
  const card = generalCard();
  if (provider) {
    await user.selectOptions(within(card).getByRole('combobox', { name: 'Provider' }), provider);
  }
  if (url) {
    const field = within(card).getByRole('textbox', { name: 'Base URL' });
    await user.clear(field);
    await user.type(field, url);
  }
  if (key) await pasteInto(user, within(card).getByLabelText('API key'), key);
  await user.click(within(card).getByRole('button', { name: 'Test connection' }));
}

describe('Setting up AI', () => {
  it('stays off until the reader sets it up, and calls no AI provider (US-114)', async () => {
    const requests = watchAiRequests();
    const { user } = renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'All stories' });
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Loading stories' })).toBeNull());

    const sidebar = screen.getByRole('navigation', { name: 'Sections and feeds' });
    await user.click(within(sidebar).getByRole('link', { name: 'Settings' }));
    const tabs = await screen.findByRole('navigation', { name: 'Settings sections' });
    await user.click(within(tabs).getByRole('link', { name: 'AI' }));

    expect(await screen.findByRole('heading', { name: 'Bring your own key' })).toBeVisible();
    expect(
      within(screen.getByRole('navigation', { name: 'Settings sections' })).getByRole('link', {
        name: 'AI',
      }),
    ).toHaveAttribute('aria-current', 'page');
    expect(document.title).toBe('AI settings · Feedolio');
    expect(statusIn(generalCard())).toHaveTextContent('Not tested yet');
    expect(
      within(generalCard()).getByText('Test the connection to load your models.'),
    ).toBeVisible();
    expect(screen.getByRole('row', { name: /Match filter rules/ })).toHaveTextContent(
      'General model · not connected yet',
    );
    expect(screen.getByText('No AI requests yet')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Remove all keys from this browser' }),
    ).toBeDisabled();
    await expectNoAxeViolations();

    expect(requests.seen).toEqual([]);
    requests.stop();
  }, 20000);

  it('connects Anthropic with a key, shows Connected and keeps the key apart (US-95, US-97)', async () => {
    const { user, reload } = renderApp('/settings/ai');
    await screen.findByRole('heading', { name: 'Bring your own key' });

    // Anthropic is first, with its fixed endpoint.
    expect(within(generalCard()).getByRole('combobox', { name: 'Provider' })).toHaveValue(
      'anthropic',
    );
    expect(within(generalCard()).getByText('https://api.anthropic.com')).toBeVisible();

    await connectGeneral(user, { key: TEST_KEYS.anthropic });
    await waitFor(() =>
      expect(statusIn(generalCard())).toHaveTextContent(/^Connected · 14 models · \d+ ms$/),
    );

    // The model list comes from the key's own provider, opening on Claude Opus 5.5.
    const model = within(generalCard()).getByRole('combobox', { name: 'Model' });
    expect(model).toHaveValue('claude-opus-5-5');
    expect(within(model).getAllByRole('option')).toHaveLength(14);

    // The key shows only its prefix and last four characters.
    expect(within(generalCard()).getByText('sk-ant-…a1b2')).toBeVisible();
    expect(
      within(generalCard()).getByText(/^Saved on this device\. Sent only to/),
    ).toHaveTextContent('Saved on this device. Sent only to api.anthropic.com.');

    await user.selectOptions(model, 'claude-sonnet-5-5');
    expect(screen.getByRole('row', { name: /Summarize, translate, explain/ })).toHaveTextContent(
      'General model · claude-sonnet-5-5',
    );
    await expectNoAxeViolations();

    // Keys live under their own item; the reader's data never holds them.
    const app = reload();
    expect(JSON.parse(localStorage.getItem(KEYS_ITEM) ?? '{}')).toEqual({
      general: TEST_KEYS.anthropic,
    });
    expect(localStorage.getItem('feedolio:v1')).not.toContain(TEST_KEYS.anthropic);
    expect(savedData().aiSettings.general).toMatchObject({
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
    });

    // After a reload the saved connection is checked again, keeping the model.
    await app.findByRole('heading', { name: 'Bring your own key' });
    await waitFor(() =>
      expect(statusIn(generalCard())).toHaveTextContent(/^Connected · 14 models · \d+ ms$/),
    );
    expect(within(generalCard()).getByRole('combobox', { name: 'Model' })).toHaveValue(
      'claude-sonnet-5-5',
    );
  });

  it('connects OpenAI, OpenRouter, Ollama and a custom server (US-95)', async () => {
    const { user } = renderApp('/settings/ai');
    await screen.findByRole('heading', { name: 'Bring your own key' });

    await connectGeneral(user, { provider: 'openai', key: TEST_KEYS.openai });
    await waitFor(() =>
      expect(statusIn(generalCard())).toHaveTextContent(/^Connected · 3 models · \d+ ms$/),
    );
    expect(within(generalCard()).getByRole('combobox', { name: 'Model' })).toHaveValue('gpt-5');

    await connectGeneral(user, { provider: 'openrouter', key: TEST_KEYS.openrouter });
    await waitFor(() =>
      expect(statusIn(generalCard())).toHaveTextContent(/^Connected · 5 models · \d+ ms$/),
    );
    expect(
      within(generalCard()).getByText(/^Saved on this device\. Sent only to/),
    ).toHaveTextContent('Saved on this device. Sent only to openrouter.ai.');

    // Ollama runs on the reader's computer and needs no key.
    await user.selectOptions(
      within(generalCard()).getByRole('combobox', { name: 'Provider' }),
      'ollama',
    );
    expect(within(generalCard()).getByText('Not needed for Ollama')).toBeVisible();
    expect(within(generalCard()).getByText(/Ollama must allow this site/)).toHaveTextContent(
      `set OLLAMA_ORIGINS to ${window.location.origin}`,
    );
    expect(within(generalCard()).getByRole('textbox', { name: 'Base URL' })).toHaveValue(
      'http://localhost:11434/v1',
    );
    await user.click(within(generalCard()).getByRole('button', { name: 'Test connection' }));
    await waitFor(() =>
      expect(statusIn(generalCard())).toHaveTextContent(/^Connected · 2 models · \d+ ms$/),
    );
    expect(within(generalCard()).getByRole('combobox', { name: 'Model' })).toHaveValue(
      'llama3.2:latest',
    );
    // Ollama's connection replaced OpenRouter's, key and all.
    expect(localStorage.getItem(KEYS_ITEM)).toBeNull();

    await connectGeneral(user, { provider: 'custom', url: CUSTOM_BASE_URL, key: TEST_KEYS.custom });
    await waitFor(() =>
      expect(statusIn(generalCard())).toHaveTextContent(/^Connected · 1 model · \d+ ms$/),
    );
    expect(screen.getByRole('row', { name: /Rank Catch me up stories/ })).toHaveTextContent(
      'General model · mistral-small-3.2',
    );
  });

  it('explains what went wrong, including how to let Ollama in (US-98)', async () => {
    const { user } = renderApp('/settings/ai');
    await screen.findByRole('heading', { name: 'Bring your own key' });

    // No key yet.
    await connectGeneral(user);
    expect(within(generalCard()).getByRole('alert')).toHaveTextContent('Paste your key first.');
    expect(within(generalCard()).getByLabelText('API key')).toHaveFocus();

    // A key the provider turns down.
    await connectGeneral(user, { key: 'sk-ant-api03-wrong-key-000000000000' });
    expect(await within(generalCard()).findByRole('alert')).toHaveTextContent(
      'The provider rejected this key (401). Check it and paste it again.',
    );
    expect(within(generalCard()).getByLabelText('API key')).toHaveAttribute('aria-invalid', 'true');
    expect(statusIn(generalCard())).toHaveTextContent('Not connected');

    // Ollama that hasn't been told to allow this site: the browser just fails.
    server.use(http.get('http://localhost:11434/v1/models', () => HttpResponse.error()));
    await user.selectOptions(
      within(generalCard()).getByRole('combobox', { name: 'Provider' }),
      'ollama',
    );
    await user.click(within(generalCard()).getByRole('button', { name: 'Test connection' }));
    expect(await within(generalCard()).findByRole('alert')).toHaveTextContent(
      'Couldn’t reach localhost:11434. Ollama must allow this site: set OLLAMA_ORIGINS, restart Ollama, then test again.',
    );

    // An address that isn't one.
    await connectGeneral(user, { provider: 'custom', url: 'not a server' });
    expect(within(generalCard()).getByRole('alert')).toHaveTextContent(
      'Enter the server’s address, starting with http:// or https://.',
    );

    // TypeSafe's own API doesn't accept requests from other websites.
    server.use(http.get('https://api.typesafe.ai/v1/models', () => HttpResponse.error()));
    await user.selectOptions(
      within(decisionCard()).getByRole('combobox', { name: 'Provider' }),
      'typesafe',
    );
    await pasteInto(user, within(decisionCard()).getByLabelText('API key'), TEST_KEYS.typesafe);
    await user.click(within(decisionCard()).getByRole('button', { name: 'Test connection' }));
    expect(await within(decisionCard()).findByRole('alert')).toHaveTextContent(
      'Couldn’t reach api.typesafe.ai. TypeSafe’s API doesn’t accept requests from other websites yet, so use Jev through OpenRouter.',
    );
    await expectNoAxeViolations();
  });

  it('keeps keys only for this tab when Remember is off (US-97)', async () => {
    const { user, reload } = renderApp('/settings/ai');
    await screen.findByRole('heading', { name: 'Bring your own key' });
    await connectGeneral(user, { key: TEST_KEYS.anthropic });
    await waitFor(() => expect(statusIn(generalCard())).toHaveTextContent(/^Connected/));

    await user.click(screen.getByRole('checkbox', { name: 'Remember on this device' }));
    expect(localStorage.getItem(KEYS_ITEM)).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(KEYS_ITEM) ?? '{}')).toEqual({
      general: TEST_KEYS.anthropic,
    });
    expect(within(generalCard()).getByText(/^Kept for this tab only\./)).toBeVisible();

    // Closing the tab takes the key with it; the rest of the setup stays.
    sessionStorage.clear();
    const app = reload();
    await app.findByRole('heading', { name: 'Bring your own key' });
    expect(statusIn(generalCard())).toHaveTextContent('Paste your key again');
    expect(within(generalCard()).getByLabelText('API key')).toHaveValue('');
    expect(app.getByRole('checkbox', { name: 'Remember on this device' })).not.toBeChecked();
  });

  it('adds Jev through OpenRouter for yes/no work, and can drop it again (US-96)', async () => {
    seedAi({ general: 'anthropic' });
    const { user } = renderApp('/settings/ai');
    await waitFor(() => expect(statusIn(generalCard())).toHaveTextContent(/^Connected · 14/));
    expect(within(decisionCard()).getByText(/will match rules and rank stories/)).toHaveTextContent(
      'Your general model (claude-opus-5-5) will match rules and rank stories.',
    );

    await user.selectOptions(
      within(decisionCard()).getByRole('combobox', { name: 'Provider' }),
      'openrouter',
    );
    await pasteInto(user, within(decisionCard()).getByLabelText('API key'), TEST_KEYS.openrouter);
    await user.click(within(decisionCard()).getByRole('button', { name: 'Test connection' }));
    await waitFor(() =>
      expect(statusIn(decisionCard())).toHaveTextContent(/^Connected · Jev · \d+ ms$/),
    );
    expect(screen.getByRole('row', { name: /Match filter rules/ })).toHaveTextContent(
      'Decision model · Jev',
    );
    expect(screen.getByRole('row', { name: /Summarize, translate, explain/ })).toHaveTextContent(
      'General model · claude-opus-5-5',
    );
    expect(JSON.parse(localStorage.getItem(KEYS_ITEM) ?? '{}')).toEqual({
      general: TEST_KEYS.anthropic,
      decision: TEST_KEYS.openrouter,
    });

    await user.selectOptions(
      within(decisionCard()).getByRole('combobox', { name: 'Provider' }),
      'none',
    );
    expect(screen.getByRole('row', { name: /Match filter rules/ })).toHaveTextContent(
      'General model · claude-opus-5-5',
    );
    expect(JSON.parse(localStorage.getItem(KEYS_ITEM) ?? '{}')).toEqual({
      general: TEST_KEYS.anthropic,
    });
  });

  it('removes every key from the browser in one step (US-99)', async () => {
    seedAi({ general: 'anthropic', decision: 'openrouter' });
    // Another account on this browser has a key too.
    localStorage.setItem(`${KEYS_ITEM}:github|42`, JSON.stringify({ general: TEST_KEYS.openai }));
    const { user } = renderApp('/settings/ai');
    await waitFor(() => expect(statusIn(generalCard())).toHaveTextContent(/^Connected · 14/));

    await user.click(screen.getByRole('button', { name: 'Remove all keys from this browser' }));

    expect(await screen.findByText('Removed all AI keys from this browser')).toBeVisible();
    expect(Object.keys(localStorage).filter((name) => name.startsWith(KEYS_ITEM))).toEqual([]);
    expect(Object.keys(sessionStorage).filter((name) => name.startsWith(KEYS_ITEM))).toEqual([]);
    expect(statusIn(generalCard())).toHaveTextContent('Not tested yet');
    expect(within(generalCard()).getByLabelText('API key')).toHaveValue('');
    expect(screen.getByRole('row', { name: /Match filter rules/ })).toHaveTextContent(
      'General model · not connected yet',
    );
    expect(
      screen.getByRole('button', { name: 'Remove all keys from this browser' }),
    ).toBeDisabled();
  });
});

describe('Key safety', () => {
  it('never sends a key to the feed endpoint, in a header or anywhere else (T-30)', async () => {
    seedAi({ general: 'anthropic', decision: 'openrouter' });
    /** @type {Request[]} */
    const feedRequests = [];
    const listener = ({ request }) => {
      if (new URL(request.url).pathname.startsWith('/api/feed')) feedRequests.push(request.clone());
    };
    server.events.on('request:start', listener);

    const { user } = renderApp('/');
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Loading stories' })).toBeNull());
    await user.click(screen.getByRole('link', { name: 'Measuring the true toll of the pandemic' }));
    await screen.findByRole('heading', {
      level: 1,
      name: 'Measuring the true toll of the pandemic',
    });
    await user.click(screen.getByRole('link', { name: /^Back to/ }));
    const sidebar = await screen.findByRole('navigation', { name: 'Sections and feeds' });
    await user.click(within(sidebar).getByRole('link', { name: 'Settings' }));
    await user.type(
      await screen.findByRole('textbox', { name: 'Website or feed link' }),
      'classic.test/index.rdf{Enter}',
    );
    expect(await screen.findByText('Found Classic RSS 1.0')).toBeVisible();
    server.events.removeListener('request:start', listener);

    expect(feedRequests.length).toBeGreaterThan(5);
    for (const request of feedRequests) {
      const everything = [request.url, ...[...request.headers].flat(), await request.text()].join(
        '\n',
      );
      for (const key of Object.values(TEST_KEYS)) expect(everything).not.toContain(key);
    }
  });

  it('keeps the setup per account, with each account’s own keys', async () => {
    seedAi({ general: 'anthropic' });
    const { user, visit } = renderApp('/settings/ai');
    await waitFor(() => expect(statusIn(generalCard())).toHaveTextContent(/^Connected · 14/));

    // A signed-in reader starts with AI off, and their keys are kept apart.
    localStorage.setItem(
      'feedolio:session',
      JSON.stringify({ id: 'github|42', name: 'Ada', avatarUrl: null }),
    );
    const app = visit('/settings/ai');
    await app.findByRole('heading', { name: 'Bring your own key' });
    expect(statusIn(generalCard())).toHaveTextContent('Not tested yet');

    await connectGeneral(user, { provider: 'openai', key: TEST_KEYS.openai });
    await waitFor(() => expect(statusIn(generalCard())).toHaveTextContent(/^Connected · 3/));
    expect(JSON.parse(localStorage.getItem(`${KEYS_ITEM}:github|42`) ?? '{}')).toEqual({
      general: TEST_KEYS.openai,
    });
    expect(JSON.parse(localStorage.getItem(KEYS_ITEM) ?? '{}')).toEqual({
      general: TEST_KEYS.anthropic,
    });
  });
});
