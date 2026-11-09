import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import Icon from '../../../components/Icon.jsx';
import { copyText } from '../../share/shareLinks.js';
import { LANGUAGES } from '../aiSettingsSlice.js';
import { answerKey, readCached, writeCached } from '../cache.js';
import { AiError, describeAiError } from '../errors.js';
import FormattedText from '../FormattedText.jsx';
import { plainText } from '../formatText.js';
import { actionPrompt, actionSystem } from '../prompts.js';
import { GENERAL_PROVIDERS, hostOf, isLocal } from '../providerInfo.js';
import { generate } from '../router.js';
import { storyPlainText } from '../storyText.js';
import { useAiContext } from '../useAi.js';
import styles from './AiActions.module.css';

/** @typedef {'summarize'|'translate'|'explain'} Action */
/** @typedef {import('../aiSettingsSlice.js').GeneralSettings} GeneralSettings */

/**
 * One answer being written or shown.
 *
 * @typedef {Object} Answer
 * @property {Action} action
 * @property {string} language   Code; '' unless translating
 * @property {'loading'|'streaming'|'done'|'stopped'|'error'} status
 * @property {string} text
 * @property {string} model      The model that wrote it
 * @property {unknown} [error]
 */

const ACTIONS = /** @type {const} */ ([
  { action: 'summarize', label: 'Summarize', busy: 'Summarizing…', title: 'Summary' },
  { action: 'translate', label: 'Translate', busy: 'Translating…', title: 'Translation' },
  { action: 'explain', label: 'Explain', busy: 'Explaining…', title: 'Explanation' },
]);

/** How often streamed text is drawn, so long answers don't redraw for every word. */
const DRAW_EVERY_MS = 60;

/**
 * Summarize, Translate and Explain on a story page (US-100 to US-103). The
 * answer streams into a panel labelled with the model that wrote it. Answers
 * are kept per story, action, language and model, so asking again is free.
 * Shown only when AI is set up (US-114).
 *
 * @param {{
 *   story: { id: string, title: string, excerpt?: string },
 *   body: DocumentFragment|null,
 *   feedTitle: string,
 *   summaryOnly: boolean,
 *   site: { host: string } | null,
 * }} props
 *   body: the cleaned story, or the feed's summary for summary-only feeds
 */
export default function AiActions({ story, body, feedTitle, summaryOnly, site }) {
  const context = useAiContext();
  const { settings, userId, generalReady } = context;
  const general = settings.general;
  const id = useId();
  const [language, setLanguage] = useState(settings.translateTo);
  const [answer, setAnswer] = useState(/** @type {Answer|null} */ (null));
  const [copied, setCopied] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const running = useRef(/** @type {AbortController|null} */ (null));
  const buttons = useRef(/** @type {Partial<Record<Action, HTMLButtonElement|null>>} */ ({}));
  const names = languageNames();
  const text = useMemo(
    () => (body ? storyPlainText(body) : (story.excerpt ?? '')),
    [body, story.excerpt],
  );

  // Leaving the story stops any answer still being written.
  useEffect(() => () => running.current?.abort(), []);

  if (!general) return null;
  const who = whose(general);

  if (!generalReady) {
    return (
      <div role="group" aria-label="AI actions" className={styles.bar}>
        <div className={styles.buttons}>
          {ACTIONS.map((item) => (
            <button key={item.action} type="button" className={styles.action} disabled>
              <Icon name="sparkle" size={16} />
              {item.label}
            </button>
          ))}
        </div>
        <p className={styles.uses}>
          <Link to="/settings/ai">Set up AI in Settings</Link>
        </p>
      </div>
    );
  }

  /**
   * Asks for an answer, or shows the one already kept.
   *
   * @param {Action} action
   * @param {string} code   Language code, for Translate
   * @param {{ fresh?: boolean }} [options]  fresh: ask again even if an answer is kept
   */
  async function ask(action, code, { fresh = false } = {}) {
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    const lang = action === 'translate' ? code : '';
    const model = general?.model ?? '';
    const key = answerKey({ scope: userId, storyId: story.id, action, language: lang, model });
    const title = titleOf(action, lang, names);
    setCopied(false);
    setAnswer({ action, language: lang, status: 'loading', text: '', model });
    setAnnouncement(`${ACTIONS.find((item) => item.action === action)?.busy}`);

    if (!fresh) {
      const kept = /** @type {{ text: string, model: string }|null} */ (
        await readCached('answers', key)
      );
      if (controller.signal.aborted) return;
      if (kept?.text) {
        setAnswer({ action, language: lang, status: 'done', text: kept.text, model: kept.model });
        setAnnouncement(`${title} ready.`);
        return;
      }
    }

    let streamed = '';
    /** @type {ReturnType<typeof setTimeout>|null} */
    let drawing = null;
    const draw = () => {
      drawing = null;
      if (controller.signal.aborted && running.current !== controller) return;
      setAnswer((now) => (now ? { ...now, status: 'streaming', text: streamed } : now));
    };
    try {
      const result = await generate(
        {
          system: actionSystem(action, { language: names(lang || 'en'), summaryOnly }),
          prompt: actionPrompt({ id: story.id, title: story.title, text, feedTitle }),
          effort: 'low',
          signal: controller.signal,
          onText: (piece) => {
            streamed += piece;
            drawing ??= setTimeout(draw, DRAW_EVERY_MS);
          },
        },
        context,
      );
      if (drawing) clearTimeout(drawing);
      if (running.current !== controller) return;
      setAnswer({ action, language: lang, status: 'done', text: result.text, model: result.model });
      setAnnouncement(`${title} ready.`);
      void writeCached('answers', key, { text: result.text, model: result.model });
    } catch (error) {
      if (drawing) clearTimeout(drawing);
      if (running.current !== controller) return;
      const stopped = error instanceof AiError && error.code === 'aborted';
      // A stopped answer keeps what arrived; a failed one (or a refusal part-way
      // through) isn't an answer, so its partial text goes.
      setAnswer((now) =>
        now
          ? { ...now, status: stopped ? 'stopped' : 'error', text: stopped ? streamed : '', error }
          : now,
      );
      setAnnouncement(stopped ? 'Stopped.' : '');
    }
  }

  /** @param {Action} action */
  function choose(action) {
    if (answer?.action === action && (action !== 'translate' || answer.language === language)) {
      close();
      return;
    }
    void ask(action, language);
  }

  function close() {
    running.current?.abort();
    running.current = null;
    const action = answer?.action;
    setAnswer(null);
    setAnnouncement('');
    if (action) buttons.current[action]?.focus();
  }

  const busy = answer?.status === 'loading' || answer?.status === 'streaming';
  const title = answer ? titleOf(answer.action, answer.language, names) : '';

  return (
    <div className={styles.wrap}>
      <div role="group" aria-label="AI actions" className={styles.bar}>
        <div className={styles.buttons}>
          {ACTIONS.map((item) => {
            const open = answer?.action === item.action;
            return (
              <ActionButton
                key={item.action}
                ref={(element) => {
                  buttons.current[item.action] = element;
                }}
                label={open && busy ? item.busy : item.label}
                pressed={open}
                onClick={() => choose(item.action)}
                after={
                  item.action === 'translate' && (
                    <div className={styles.selectWrap}>
                      <label htmlFor={`${id}-language`} className="visually-hidden">
                        Translate into
                      </label>
                      <select
                        id={`${id}-language`}
                        className={styles.select}
                        value={language}
                        onChange={(event) => {
                          setLanguage(event.target.value);
                          void ask('translate', event.target.value);
                        }}
                      >
                        {LANGUAGES.map((code) => (
                          <option key={code} value={code}>
                            {names(code)}
                          </option>
                        ))}
                      </select>
                      <Icon name="chevronDown" size={16} className={styles.caret} />
                    </div>
                  )
                }
              />
            );
          })}
        </div>
        <p className={styles.uses}>
          Uses {who} · <Link to="/settings/ai">AI settings</Link>
        </p>
      </div>

      <p role="status" className="visually-hidden">
        {announcement}
        {copied ? ' Copied.' : ''}
      </p>

      {answer && (
        <section aria-labelledby={`${id}-title`} className={styles.panel} aria-busy={busy}>
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>
              <Icon name="sparkle" size={18} className={styles.spark} />
              <h2 id={`${id}-title`} className={styles.panelHeading}>
                {title}
              </h2>
            </span>
            <span className={styles.provenance}>
              {answer.model} · {who}
            </span>
          </div>

          {summaryOnly && (
            <p className={styles.small}>
              Based on the feed’s summary{site ? `; the full story is on ${site.host}` : ''}.
            </p>
          )}

          {answer.status === 'loading' && (
            <div className={styles.waiting} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          )}
          {answer.text && <FormattedText text={answer.text} className={styles.answer} />}
          {answer.status === 'stopped' && <p className={styles.small}>Stopped.</p>}
          {answer.status === 'error' && (
            <div role="alert" className={styles.alert}>
              <Icon name="alert" size={18} />
              <span className={styles.alertText}>
                {describeAiError(answer.error, {
                  label: GENERAL_PROVIDERS[general.provider].label,
                  host: hostOf(general.baseUrl),
                  local: general.provider === 'ollama' || isLocal(general.baseUrl),
                })}{' '}
                <Link to="/settings/ai">AI settings</Link>
              </span>
              <button
                type="button"
                className={styles.retry}
                onClick={() => void ask(answer.action, answer.language || language)}
              >
                Retry
              </button>
            </div>
          )}

          <div className={styles.panelFoot}>
            <div className={styles.panelActions}>
              {busy ? (
                <button
                  type="button"
                  className={styles.panelAction}
                  onClick={() => running.current?.abort()}
                >
                  <Icon name="close" size={16} />
                  Stop
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className={styles.panelAction}
                    disabled={answer.status !== 'done'}
                    onClick={async () => setCopied(await copyText(plainText(answer.text)))}
                  >
                    <Icon name={copied ? 'check' : 'link'} size={16} />
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    className={styles.panelAction}
                    onClick={() =>
                      void ask(answer.action, answer.language || language, { fresh: true })
                    }
                  >
                    <Icon name="refresh" size={16} />
                    Regenerate
                  </button>
                </>
              )}
              <button
                type="button"
                className={styles.panelAction}
                aria-label={`Close ${title.split(' · ')[0].toLowerCase()}`}
                onClick={close}
              >
                <Icon name="close" size={16} />
                Close
              </button>
            </div>
            <p className={styles.small}>AI can make mistakes. Check the original.</p>
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * @param {{
 *   ref: (element: HTMLButtonElement|null) => void,
 *   label: string,
 *   pressed: boolean,
 *   onClick: () => void,
 *   after?: import('react').ReactNode,
 * }} props
 */
function ActionButton({ ref, label, pressed, onClick, after }) {
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={styles.action}
        aria-pressed={pressed}
        onClick={onClick}
      >
        <Icon name="sparkle" size={16} />
        {label}
      </button>
      {after}
    </>
  );
}

/**
 * Whose model it is, as the panel and bar say it.
 *
 * @param {GeneralSettings} general
 */
function whose(general) {
  if (general.provider === 'ollama') return 'Ollama on this computer';
  if (general.provider === 'custom') return 'your own server';
  return `your ${GENERAL_PROVIDERS[general.provider].label} key`;
}

/**
 * @param {Action} action
 * @param {string} language
 * @param {(code: string) => string} names
 */
function titleOf(action, language, names) {
  const base = ACTIONS.find((item) => item.action === action)?.title ?? '';
  return action === 'translate' ? `${base} · ${names(language)}` : base;
}

/** A language's English name. */
function languageNames() {
  const english = new Intl.DisplayNames(['en'], { type: 'language' });
  return (/** @type {string} */ code) => english.of(code) ?? code;
}
