import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { judgeAs, RULE_RECORDINGS, seedAi, seedRules } from '../fixtures/ai.js';
import { server } from '../msw/server.js';
import { expectNoAxeViolations } from '../support/axe.js';
import { freezeTime } from '../support/clock.js';
import { renderApp } from '../support/renderApp.jsx';

freezeTime();

const SUMMIT = 'TechCrunch Founder Summit 2026: Doors open at 9 a.m. ET in Boston';
const SUMMITS = [
  SUMMIT,
  /^The TechCrunch Founder Summit agenda/,
  /^Tomorrow: TechCrunch Founder Summit/,
];
const WONDER = /^Food delivery startup Wonder files for IPO/;
const WONDER_ID = 's_ar5p2qpept';
const PODCAST = /^Introducing “Checks and Balance”/;
const PODCAST_ID = 's_181hop818oy';
const MIC = 'Shure’s popular podcasting and streaming mic is almost $50 off';
const MIC_ID = 's_n9053e5ros';

const sidebar = () => screen.getByRole('navigation', { name: 'Sections and feeds' });

/** Rule checks run in batches a moment after stories load; slower under coverage. */
const CHECKS = { timeout: 15000 };

/** Waits until every feed has loaded. */
async function storiesLoaded() {
  await waitFor(() => expect(screen.queryByRole('list', { name: 'Loading stories' })).toBeNull());
}

/** Requests that judged stories, by host. */
function watchJudging() {
  /** @type {string[]} */
  const hosts = [];
  const listener = async ({ request }) => {
    const { host, pathname } = new URL(request.url);
    if (pathname.endsWith('/systemone')) hosts.push(host);
    if (pathname === '/v1/messages') {
      const body = await request.clone().json();
      if (String(body.system).startsWith('You check news stories')) hosts.push(host);
    }
  };
  server.events.on('request:start', listener);
  return hosts;
}

describe('Filter rules', () => {
  it('hide event announcements: Founder Summit stories move to Hidden, Unhide restores them, nothing is deleted (T-31)', async () => {
    seedAi({ general: 'anthropic', decision: 'openrouter' });
    seedRules([{ text: RULE_RECORDINGS.events, action: 'hide' }]);
    const judging = watchJudging();
    const { user, reload } = renderApp('/');
    await storiesLoaded();

    // The rule checks every story once, in batches of up to 25, with Jev.
    expect(await screen.findByText(/^Rules checked by Jev/, {}, CHECKS)).toHaveTextContent(
      'Rules checked by Jev (decision model) · just now · Manage rules',
    );
    expect(judging).toEqual(['openrouter.ai', 'openrouter.ai', 'openrouter.ai']);
    for (const title of SUMMITS) expect(screen.queryByRole('link', { name: title })).toBeNull();
    expect(screen.getByText(/stories hidden by your rules/)).toHaveTextContent(
      '4 stories hidden by your rules · View hidden',
    );
    expect(within(sidebar()).getByRole('link', { name: /^Hidden/ })).toHaveAccessibleName(
      'Hidden, 4 hidden',
    );
    expect(within(sidebar()).getByRole('link', { name: /^Maybe/ })).toHaveAccessibleName(
      'Maybe, 3 to review',
    );

    // Hidden lists them with the reason.
    await user.click(within(sidebar()).getByRole('link', { name: /^Hidden/ }));
    const hidden = await screen.findByRole('list', { name: 'Hidden stories' });
    expect(within(hidden).getAllByRole('listitem')).toHaveLength(4);
    expect(
      within(hidden).getByText('Hidden by rule: Event announcements · 93% match'),
    ).toBeVisible();
    await expectNoAxeViolations();

    // Unhide brings a story back; Undo hides it again.
    await user.click(within(hidden).getByRole('button', { name: `Unhide: ${SUMMIT}` }));
    expect(screen.getByText('Moved back to your stories')).toBeVisible();
    expect(within(hidden).getAllByRole('listitem')).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(within(hidden).getAllByRole('listitem')).toHaveLength(4);
    await user.click(within(hidden).getByRole('button', { name: `Unhide: ${SUMMIT}` }));
    await user.click(within(sidebar()).getByRole('link', { name: 'All stories' }));
    expect(await screen.findByRole('link', { name: SUMMIT })).toBeVisible();

    // After a reload nothing is checked again, and the answer holds.
    const app = reload();
    await storiesLoaded();
    expect(await app.findByRole('link', { name: SUMMIT })).toBeVisible();
    await waitFor(() => expect(app.getByText(/stories hidden by your rules/)).toBeVisible());
    expect(app.getByText(/stories hidden by your rules/)).toHaveTextContent(
      '3 stories hidden by your rules',
    );
    expect(judging).toHaveLength(3);

    // Removing the rule leaves Hidden as it was.
    await app.user.click(within(sidebar()).getByRole('link', { name: 'Settings' }));
    await app.user.click(
      within(await screen.findByRole('navigation', { name: 'Settings sections' })).getByRole(
        'link',
        {
          name: 'Rules',
        },
      ),
    );
    await app.user.click(
      await screen.findByRole('button', { name: `Remove rule: ${RULE_RECORDINGS.events}` }),
    );
    expect(screen.getByText('Rule removed. Stories it hid stay in Hidden.')).toBeVisible();
    await app.user.click(within(sidebar()).getByRole('link', { name: /^Hidden/ }));
    expect(
      within(await screen.findByRole('list', { name: 'Hidden stories' })).getAllByRole('listitem'),
    ).toHaveLength(3);
  }, 30000);

  it('sends an uncertain story to Maybe; "Yes" tags it and the answer survives a reload (T-32)', async () => {
    seedAi({ general: 'anthropic', decision: 'openrouter' });
    seedRules([{ text: RULE_RECORDINGS.funding, action: 'tag', tag: 'Funding' }]);
    judgeAs(WONDER_ID, 0.58);
    const { user, reload } = renderApp('/');
    await storiesLoaded();
    await waitFor(
      () =>
        expect(within(sidebar()).getByRole('link', { name: /^Funding/ })).toHaveAccessibleName(
          'Funding, 5 stories',
        ),
      CHECKS,
    );

    // Tagged stories carry the tag in the list; the 58% one waits in Maybe.
    const tagChips = screen.getAllByRole('link', { name: 'Tag: Funding' });
    expect(tagChips).toHaveLength(5);
    await user.click(within(sidebar()).getByRole('link', { name: /^Maybe/ }));
    const review = await screen.findByRole('list', { name: 'Stories to review' });
    const card = within(review).getByRole('listitem');
    expect(within(card).getByRole('heading', { name: WONDER })).toBeVisible();
    expect(card).toHaveTextContent(`Maybe 58% match · Rule: “${RULE_RECORDINGS.funding}”`);
    expect(screen.getByRole('note')).toHaveTextContent(/^Checked by Jev \(decision model\)\./);
    await expectNoAxeViolations();

    await user.click(within(card).getByRole('button', { name: /^Yes, tag as Funding/ }));
    expect(screen.getByText('Tagged as Funding')).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Nothing to review' })).toBeVisible();

    // The answer is remembered, and wins over the model.
    const app = reload();
    await waitFor(
      () =>
        expect(within(sidebar()).getByRole('link', { name: /^Funding/ })).toHaveAccessibleName(
          'Funding, 6 stories',
        ),
      CHECKS,
    );
    await app.user.click(within(sidebar()).getByRole('link', { name: /^Funding/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Funding' })).toBeVisible();
    expect(screen.getByText('Tagged by your rules · 6 stories')).toBeVisible();
    expect(screen.getByRole('link', { name: WONDER })).toBeVisible();
    await app.user.click(within(sidebar()).getByRole('link', { name: /^Maybe/ }));
    expect(await screen.findByRole('heading', { name: 'Nothing to review' })).toBeVisible();
  }, 30000);

  it('judges with Jev, then with the general model and its wider Maybe band once Jev is removed (T-29)', async () => {
    seedAi({ general: 'anthropic', decision: 'openrouter' });
    seedRules([{ text: RULE_RECORDINGS.events, action: 'hide' }]);
    // 80% would apply with Jev (75%+), but is only a Maybe from a general model (85%+).
    judgeAs(PODCAST_ID, 0.8);
    const judging = watchJudging();
    const { user } = renderApp('/');
    await storiesLoaded();
    await waitFor(() => expect(judging).toHaveLength(3), CHECKS);
    expect(new Set(judging)).toEqual(new Set(['openrouter.ai']));
    await waitFor(() => expect(screen.queryByRole('link', { name: PODCAST })).toBeNull(), CHECKS);

    // Remove Jev, then reword the rule so stories are checked again.
    await user.click(within(sidebar()).getByRole('link', { name: 'Settings' }));
    const tabs = await screen.findByRole('navigation', { name: 'Settings sections' });
    await user.click(within(tabs).getByRole('link', { name: 'AI' }));
    await user.selectOptions(
      within(await screen.findByRole('region', { name: 'Decision model' })).getByRole('combobox', {
        name: 'Provider',
      }),
      'none',
    );
    await user.click(
      within(screen.getByRole('navigation', { name: 'Settings sections' })).getByRole('link', {
        name: 'Rules',
      }),
    );
    expect(await screen.findByText('Checked by your general model')).toBeVisible();
    await user.click(screen.getByRole('button', { name: `Edit rule: ${RULE_RECORDINGS.events}` }));
    const editing = within(screen.getByRole('list', { name: 'Your rules' }));
    const text = editing.getByRole('textbox', { name: 'Describe what to match, in plain English' });
    await user.clear(text);
    await user.type(text, `${RULE_RECORDINGS.events}.`);
    await user.click(editing.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(judging).toHaveLength(6), CHECKS);
    expect(judging.slice(3)).toEqual([
      'api.anthropic.com',
      'api.anthropic.com',
      'api.anthropic.com',
    ]);

    await user.click(within(sidebar()).getByRole('link', { name: /^Maybe/ }));
    const review = await screen.findByRole('list', { name: 'Stories to review' });
    expect(within(review).getByRole('heading', { name: PODCAST })).toBeVisible();
    expect(within(review).getByRole('listitem')).toHaveTextContent('Maybe 80% match');
    expect(screen.getByRole('note')).toHaveTextContent(/^Checked by your general model\./);
  }, 30000);

  it('writes, tests, edits, switches off and removes rules (US-104, US-106)', async () => {
    seedAi({ general: 'anthropic' });
    const { user } = renderApp('/settings/rules');
    expect(await screen.findByRole('heading', { name: 'Filter rules' })).toBeVisible();
    expect(document.title).toBe('Rules · Feedolio');
    expect(screen.getByText('Checked by your general model')).toBeVisible();

    // The form checks what's missing.
    await user.click(screen.getByRole('button', { name: 'Save rule' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Describe what the rule should match.');
    const text = screen.getByRole('textbox', { name: 'Describe what to match, in plain English' });
    expect(text).toHaveFocus();
    await user.type(text, 'Stories about new phones');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Then' }), 'tag');
    await user.click(screen.getByRole('button', { name: 'Save rule' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Give the tag a name.');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Then' }), 'hide');
    await user.clear(text);

    // Testing shows what a rule would catch, without saving anything.
    await user.type(text, RULE_RECORDINGS.events);
    await user.click(screen.getByRole('button', { name: 'Test on recent stories' }));
    const results = await screen.findByRole('list', { name: 'Test results' });
    expect(within(results).getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByText('Test results · 5 recent stories')).toBeVisible();
    expect(screen.getByText(/^Test finished:/)).toHaveTextContent(
      'Test finished: 0 would match, 0 would go to Maybe.',
    );
    expect(within(results).getAllByText(/^No · \d+%$/)).toHaveLength(5);
    await expectNoAxeViolations();

    await user.click(screen.getByRole('button', { name: 'Save rule' }));
    expect(screen.getByText('Rule saved. It’s checking your stories now.')).toBeVisible();
    const rules = screen.getByRole('list', { name: 'Your rules' });
    const card = within(rules).getByRole('listitem');
    expect(card).toHaveTextContent(`“${RULE_RECORDINGS.events}”`);
    await waitFor(() => expect(card).toHaveTextContent('3 hidden'), CHECKS);
    expect(within(card).getByRole('link', { name: 'View Hidden (3)' })).toHaveAttribute(
      'href',
      '/hidden',
    );

    // Off, then on again.
    const toggle = within(card).getByRole('switch', { name: `Rule on: ${RULE_RECORDINGS.events}` });
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    await user.click(toggle);

    // Edit: Cancel keeps it; Save changes rewords it.
    await user.click(
      within(card).getByRole('button', { name: `Edit rule: ${RULE_RECORDINGS.events}` }),
    );
    await user.click(within(card).getByRole('button', { name: 'Cancel' }));
    expect(within(card).getByRole('button', { name: /^Edit rule/ })).toHaveFocus();
    await user.click(within(card).getByRole('button', { name: /^Edit rule/ }));
    await user.selectOptions(within(card).getByRole('combobox', { name: 'Then' }), 'highlight');
    await user.click(within(card).getByRole('button', { name: 'Save changes' }));
    expect(await within(rules).findByText('Highlight')).toBeVisible();

    // Remove, with Undo.
    await user.click(
      screen.getByRole('button', { name: `Remove rule: ${RULE_RECORDINGS.events}` }),
    );
    expect(screen.queryByRole('list', { name: 'Your rules' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('list', { name: 'Your rules' })).toBeVisible();
  }, 30000);

  it('highlights matching stories in lists (US-105)', async () => {
    seedAi({ general: 'anthropic', decision: 'openrouter' });
    seedRules([{ text: 'Highlight new AI devices and gadgets', action: 'highlight' }]);
    judgeAs(MIC_ID, 0.9);
    renderApp('/');
    await storiesLoaded();

    const row = await waitFor(() => {
      const found = screen.getByRole('link', { name: MIC }).closest('li');
      expect(found).toHaveAttribute('data-highlight');
      return /** @type {HTMLElement} */ (found);
    }, CHECKS);
    expect(within(row).getByText('Highlighted · New AI devices')).toBeVisible();
    await expectNoAxeViolations();
  }, 30000);

  it('says why rules stopped checking', async () => {
    seedAi({ general: 'anthropic', decision: 'openrouter' });
    seedRules([{ text: RULE_RECORDINGS.events, action: 'hide' }]);
    server.use(
      http.post('https://openrouter.ai/api/v1/systemone', () =>
        HttpResponse.json({ error: { message: 'User not found.', code: 401 } }, { status: 401 }),
      ),
    );
    renderApp('/');
    await storiesLoaded();
    expect(
      await screen.findByText(/^Rules couldn’t check new stories/, {}, CHECKS),
    ).toHaveTextContent(
      'Rules couldn’t check new stories. The provider rejected this key (401). Check it and paste it again. · Manage rules',
    );
    expect(screen.getByRole('link', { name: SUMMIT })).toBeVisible();
  }, 30000);

  it('shows nothing about rules to readers without any (US-114)', async () => {
    seedAi({ general: 'anthropic' });
    renderApp('/');
    await storiesLoaded();
    expect(within(sidebar()).queryByRole('heading', { name: 'AI' })).toBeNull();
    expect(screen.queryByText(/hidden by your rules/)).toBeNull();
    expect(screen.queryByText(/^Rules /)).toBeNull();
  });
});
