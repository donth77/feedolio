import { useEffect, useId, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Link } from 'react-router';
import { toastShown } from '../../app/toastSlice.js';
import Icon from '../../components/Icon.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SettingsTabs from '../subscriptions/SettingsTabs.jsx';
import {
  aiReset,
  decisionRemoved,
  decisionSaved,
  featureToggled,
  generalModelChosen,
  generalSaved,
  LANGUAGES,
  rememberKeysChanged,
  translateToChanged,
} from './aiSettingsSlice.js';
import styles from './AiSettings.module.css';
import { AiError, describeAiError } from './errors.js';
import { deleteKey, getKey, moveKeys, removeAllKeys, setKey } from './keys.js';
import {
  cleanBaseUrl,
  DECISION_PROVIDERS,
  GENERAL_PROVIDERS,
  hostOf,
  isLocal,
  maskKey,
} from './providerInfo.js';
import { testDecision, testGeneral } from './router.js';
import { useAiContext, useAiUsage } from './useAi.js';

/** @typedef {import('./providerInfo.js').GeneralProvider} GeneralProvider */
/** @typedef {import('./providerInfo.js').DecisionProvider} DecisionProvider */
/** @typedef {import('./types.js').ModelSummary} ModelSummary */

/**
 * How the last connection test went.
 *
 * @typedef {{ kind: 'idle' }
 *   | { kind: 'testing' }
 *   | { kind: 'ok', detail: string }
 *   | { kind: 'error', message: string, rejected: boolean }} TestStatus
 */

/** @type {TestStatus} */
const IDLE = { kind: 'idle' };
/** @type {TestStatus} */
const TESTING = { kind: 'testing' };

/**
 * Settings › AI (/settings/ai): bring-your-own-key setup. AI stays off until
 * a general model connects (US-114); keys stay in this browser and go only
 * to their provider (US-97).
 */
export default function AiSettings() {
  return (
    <>
      <PageHeader
        title="Settings"
        documentTitle="AI settings"
        description="Changes save automatically on this device."
      />
      <SettingsTabs />
      <div className={styles.page}>
        <section aria-labelledby="ai-byok" className={styles.byok}>
          <Icon name="lock" size={24} className={styles.byokIcon} />
          <div className={styles.byokText}>
            <h2 id="ai-byok" className={styles.byokTitle}>
              Bring your own key
            </h2>
            <p>
              Your keys stay in this browser. Requests go straight from your browser to the provider
              you choose; Feedolio’s servers never see your keys or your AI requests. The text of
              stories you use AI on is sent to that provider, and your provider bills you.
            </p>
          </div>
        </section>
        <GeneralModel />
        <DecisionModel />
        <WhichModel />
        <Features />
        <div className={styles.pair}>
          <Usage />
          <DangerZone />
        </div>
      </div>
    </>
  );
}

/** The model that writes: required for AI (US-95, US-98). */
function GeneralModel() {
  const dispatch = useDispatch();
  const { settings, userId } = useAiContext();
  const general = settings.general;
  const id = useId();

  const [provider, setProvider] = useState(
    /** @type {GeneralProvider} */ (general?.provider ?? 'anthropic'),
  );
  const info = GENERAL_PROVIDERS[provider];
  const [baseUrl, setBaseUrl] = useState(
    general?.provider === provider ? general.baseUrl : info.baseUrl,
  );
  const [draftKey, setDraftKey] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [shown, setShown] = useState(false);
  const [models, setModels] = useState(/** @type {ModelSummary[]} */ ([]));
  // A saved connection is checked when the page opens, which also loads its
  // model list. Listing models costs nothing.
  const [openingCheck] = useState(() => {
    if (!general) return null;
    const key = getKey(userId, 'general');
    if (GENERAL_PROVIDERS[general.provider].key === 'required' && !key) return null;
    return { provider: general.provider, baseUrl: general.baseUrl, key };
  });
  const [status, setStatus] = useState(/** @type {TestStatus} */ (openingCheck ? TESTING : IDLE));
  const keyInput = useRef(/** @type {HTMLInputElement|null} */ (null));
  // Each test gets a number, so an answer to an older one is ignored.
  const attempt = useRef(0);

  const savedKey = getKey(userId, 'general');
  const url = info.editableUrl ? cleanBaseUrl(baseUrl) : info.baseUrl;
  const host = url ? hostOf(url) : 'the address above';
  const isSaved = Boolean(general && general.provider === provider && general.baseUrl === url);
  const showSavedKey = isSaved && Boolean(savedKey) && !replacing && info.key !== 'none';
  // Saved, but the key is gone (it was kept for a tab that closed).
  const keyMissing = isSaved && info.key === 'required' && !savedKey;

  /**
   * Tries a connection and shows how it went.
   *
   * @param {{ provider: GeneralProvider, baseUrl: string, key: string|null }} connection
   * @param {{ save: boolean, mine: number }} options
   *   save: keep the key and use this connection; mine: this test's number
   */
  async function checkConnection(connection, { save, mine }) {
    try {
      const { models: found, ms } = await testGeneral(connection);
      if (mine !== attempt.current) return;
      if (found.length === 0) {
        setStatus({
          kind: 'error',
          message:
            connection.provider === 'ollama'
              ? 'Ollama has no models yet. Pull one first, for example: ollama pull llama3.2'
              : `${GENERAL_PROVIDERS[connection.provider].label} lists no models for this key.`,
          rejected: false,
        });
        return;
      }
      const keep = general?.provider === connection.provider ? general.model : undefined;
      const chosen =
        found.find((model) => model.id === keep) ??
        found.find((model) => model.id === GENERAL_PROVIDERS[connection.provider].defaultModel) ??
        found[0];
      if (save) {
        if (connection.key) setKey(userId, 'general', connection.key, settings.rememberKeys);
        else deleteKey(userId, 'general');
      }
      dispatch(
        generalSaved({
          provider: connection.provider,
          baseUrl: connection.baseUrl,
          model: chosen.id,
          traits: chosen.traits,
        }),
      );
      setModels(found);
      setDraftKey('');
      setReplacing(false);
      setShown(false);
      setStatus({
        kind: 'ok',
        detail: `${found.length} ${found.length === 1 ? 'model' : 'models'} · ${ms} ms`,
      });
    } catch (error) {
      if (mine !== attempt.current) return;
      setStatus({
        kind: 'error',
        message: describeAiError(error, {
          label: GENERAL_PROVIDERS[connection.provider].label,
          host: hostOf(connection.baseUrl),
          local: connection.provider === 'ollama' || isLocal(connection.baseUrl),
        }),
        rejected: error instanceof AiError && error.code === 'auth',
      });
    }
  }

  const checked = useRef(false);
  useEffect(() => {
    if (checked.current || !openingCheck) return;
    checked.current = true;
    void checkConnection(openingCheck, { save: false, mine: ++attempt.current });
    // Runs once, for the connection saved when the page opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (replacing) keyInput.current?.focus();
  }, [replacing]);

  /** @param {GeneralProvider} next */
  function switchProvider(next) {
    attempt.current += 1;
    setProvider(next);
    setBaseUrl(general?.provider === next ? general.baseUrl : GENERAL_PROVIDERS[next].baseUrl);
    setDraftKey('');
    setReplacing(false);
    setShown(false);
    setStatus(IDLE);
  }

  function test() {
    if (!url) {
      setStatus({
        kind: 'error',
        message: 'Enter the server’s address, starting with http:// or https://.',
        rejected: false,
      });
      return;
    }
    const typed = draftKey.trim();
    const key = info.key === 'none' ? null : typed || (isSaved ? savedKey : null);
    if (info.key === 'required' && !key) {
      setStatus({ kind: 'error', message: 'Paste your key first.', rejected: false });
      keyInput.current?.focus();
      return;
    }
    const mine = ++attempt.current;
    setStatus(TESTING);
    void checkConnection({ provider, baseUrl: url, key }, { save: true, mine });
  }

  const modelOptions =
    models.length > 0
      ? models
      : general
        ? [{ id: general.model, label: general.model, traits: general.traits }]
        : [];

  return (
    <section aria-labelledby={`${id}-title`} className={styles.card}>
      <div className={styles.cardHead}>
        <div className={styles.titleRow}>
          <h2 id={`${id}-title`} className={styles.cardTitle}>
            General model
          </h2>
          <span className={styles.tag}>Required for AI</span>
        </div>
        <p className={styles.help}>
          Writes summaries, translations, explanations and Catch me up digests. Any
          OpenAI-compatible endpoint, or Anthropic.
        </p>
      </div>

      <div className={styles.fields}>
        <div className={styles.field}>
          <label htmlFor={`${id}-provider`} className={styles.label}>
            Provider
          </label>
          <Select
            id={`${id}-provider`}
            value={provider}
            onChange={(value) => switchProvider(/** @type {GeneralProvider} */ (value))}
            options={Object.entries(GENERAL_PROVIDERS).map(([value, option]) => ({
              value,
              label: option.label,
            }))}
          />
        </div>

        <div className={styles.field}>
          {info.editableUrl ? (
            <>
              <label htmlFor={`${id}-url`} className={styles.label}>
                Base URL
              </label>
              <input
                id={`${id}-url`}
                className={`${styles.input} ${styles.mono}`}
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="https://your-server.example/v1"
                value={baseUrl}
                onChange={(event) => {
                  attempt.current += 1;
                  setBaseUrl(event.target.value);
                  setStatus(IDLE);
                }}
              />
            </>
          ) : (
            <>
              <span className={styles.label}>Endpoint</span>
              <p className={styles.fixed}>
                <Icon name="lock" size={16} />
                {info.baseUrl}
              </p>
            </>
          )}
        </div>

        <div className={styles.field}>
          {isSaved ? (
            <>
              <label htmlFor={`${id}-model`} className={styles.label}>
                Model
              </label>
              <Select
                id={`${id}-model`}
                value={general?.model ?? ''}
                onChange={(value) => {
                  const model = modelOptions.find((option) => option.id === value);
                  if (model)
                    dispatch(generalModelChosen({ model: model.id, traits: model.traits }));
                }}
                options={modelOptions.map((model) => ({ value: model.id, label: model.id }))}
              />
              <p className={styles.small}>Loaded from your provider’s model list.</p>
            </>
          ) : (
            <>
              <span className={styles.label}>Model</span>
              <p className={styles.fixed}>Test the connection to load your models.</p>
            </>
          )}
        </div>

        <div className={styles.field}>
          {info.key === 'none' ? (
            <>
              <span className={styles.label}>API key</span>
              <p className={styles.fixed}>Not needed for Ollama</p>
              <p className={styles.small}>{info.help}</p>
            </>
          ) : showSavedKey ? (
            <>
              <span id={`${id}-key-label`} className={styles.label}>
                API key
              </span>
              <div className={styles.keyRow} role="group" aria-labelledby={`${id}-key-label`}>
                <p className={`${styles.fixed} ${styles.grow}`}>
                  <Icon name="lock" size={16} />
                  {maskKey(savedKey ?? '')}
                </p>
                <button
                  type="button"
                  className={styles.quiet}
                  aria-label="Replace API key"
                  onClick={() => setReplacing(true)}
                >
                  Replace
                </button>
              </div>
              <p className={styles.small}>
                {settings.rememberKeys ? 'Saved on this device.' : 'Kept for this tab only.'} Sent
                only to <span className={styles.code}>{host}</span>.
              </p>
            </>
          ) : (
            <>
              <label htmlFor={`${id}-key`} className={styles.label}>
                API key
              </label>
              <div className={styles.keyRow}>
                <input
                  id={`${id}-key`}
                  ref={keyInput}
                  className={`${styles.input} ${styles.mono} ${styles.grow}`}
                  type={shown ? 'text' : 'password'}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={info.placeholder}
                  value={draftKey}
                  aria-describedby={`${id}-key-help`}
                  aria-invalid={status.kind === 'error' && status.rejected ? true : undefined}
                  onChange={(event) => setDraftKey(event.target.value)}
                />
                <button
                  type="button"
                  className={styles.secondary}
                  aria-label={shown ? 'Hide key' : 'Show key'}
                  onClick={() => setShown(!shown)}
                >
                  {shown ? 'Hide' : 'Show'}
                </button>
              </div>
              <p id={`${id}-key-help`} className={styles.small}>
                {info.help}
              </p>
            </>
          )}
        </div>
      </div>

      <RememberKeys />

      {provider === 'ollama' && (
        <p className={styles.note}>
          <Icon name="info" size={18} />
          <span>
            Ollama must allow this site: set <code className={styles.code}>OLLAMA_ORIGINS</code> to{' '}
            <code className={styles.code}>{window.location.origin}</code>. Your browser may ask
            permission to reach a local server.
          </span>
        </p>
      )}

      <TestRow
        status={status}
        connected={isSaved && !keyMissing}
        idleText={keyMissing ? 'Paste your key again' : undefined}
        onTest={test}
        footnote={
          info.key === 'none' ? null : (
            <>
              Your key is sent only to <span className={styles.code}>{host}</span>.
            </>
          )
        }
      />
      {general && !isSaved && (
        <p className={styles.small}>
          Until this one works, Feedolio keeps using {GENERAL_PROVIDERS[general.provider].label}.
        </p>
      )}
    </section>
  );
}

/** "Remember on this device": where keys are kept (US-97). */
function RememberKeys() {
  const dispatch = useDispatch();
  const { settings, userId } = useAiContext();
  const id = useId();
  return (
    <div className={styles.check}>
      <input
        id={id}
        type="checkbox"
        className={styles.checkbox}
        checked={settings.rememberKeys}
        aria-describedby={`${id}-help`}
        onChange={(event) => {
          dispatch(rememberKeysChanged(event.target.checked));
          moveKeys(userId, event.target.checked);
        }}
      />
      <div className={styles.checkText}>
        <label htmlFor={id} className={styles.checkLabel}>
          Remember on this device
        </label>
        <span id={`${id}-help`} className={styles.small}>
          When off, keys are forgotten when you close this tab.
        </span>
      </div>
    </div>
  );
}

/** The optional model for yes/no and scoring (US-96). */
function DecisionModel() {
  const dispatch = useDispatch();
  const { settings, userId } = useAiContext();
  const id = useId();
  const [choice, setChoice] = useState(
    /** @type {DecisionProvider|'none'} */ (settings.decision?.provider ?? 'none'),
  );
  const [draftKey, setDraftKey] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [shown, setShown] = useState(false);
  const [status, setStatus] = useState(IDLE);
  const keyInput = useRef(/** @type {HTMLInputElement|null} */ (null));
  const attempt = useRef(0);

  const info = choice === 'none' ? null : DECISION_PROVIDERS[choice];
  const savedKey = getKey(userId, 'decision');
  const isSaved = settings.decision?.provider === choice && Boolean(savedKey);
  const host = info ? hostOf(info.baseUrl) : '';

  useEffect(() => {
    if (replacing) keyInput.current?.focus();
  }, [replacing]);

  /** @param {DecisionProvider|'none'} next */
  function choose(next) {
    attempt.current += 1;
    setChoice(next);
    setDraftKey('');
    setReplacing(false);
    setShown(false);
    setStatus(IDLE);
    if (next === 'none' && settings.decision) {
      dispatch(decisionRemoved());
      deleteKey(userId, 'decision');
    }
  }

  async function test() {
    if (choice === 'none' || !info) return;
    const key = draftKey.trim() || (isSaved ? savedKey : null);
    if (!key) {
      setStatus({ kind: 'error', message: 'Paste your key first.', rejected: false });
      keyInput.current?.focus();
      return;
    }
    const mine = ++attempt.current;
    setStatus(TESTING);
    try {
      const { ms } = await testDecision({ provider: choice, key });
      if (mine !== attempt.current) return;
      setKey(userId, 'decision', key, settings.rememberKeys);
      dispatch(decisionSaved(choice));
      setDraftKey('');
      setReplacing(false);
      setShown(false);
      setStatus({ kind: 'ok', detail: `Jev · ${ms} ms` });
    } catch (error) {
      if (mine !== attempt.current) return;
      setStatus({
        kind: 'error',
        message: describeAiError(error, {
          label: choice === 'typesafe' ? 'TypeSafe' : 'OpenRouter',
          host,
          decision: choice,
        }),
        rejected: error instanceof AiError && error.code === 'auth',
      });
    }
  }

  return (
    <section aria-labelledby={`${id}-title`} className={styles.card}>
      <div className={styles.cardHead}>
        <div className={styles.titleRow}>
          <h2 id={`${id}-title`} className={styles.cardTitle}>
            Decision model
          </h2>
          <span className={styles.tag}>Optional</span>
        </div>
        <p className={styles.help}>
          A decision model answers yes/no questions and scores items, matching your filter rules and
          ranking Catch me up stories, with calibrated confidence. Without one, your general model
          does this too.
        </p>
      </div>

      <div className={styles.fields}>
        <div className={styles.field}>
          <label htmlFor={`${id}-provider`} className={styles.label}>
            Provider
          </label>
          <Select
            id={`${id}-provider`}
            value={choice}
            onChange={(value) => choose(/** @type {DecisionProvider|'none'} */ (value))}
            options={[
              { value: 'none', label: 'None (use the general model)' },
              ...Object.entries(DECISION_PROVIDERS).map(([value, option]) => ({
                value,
                label: option.label,
              })),
            ]}
          />
        </div>
        {info && (
          <div className={styles.field}>
            {isSaved && !replacing ? (
              <>
                <span id={`${id}-key-label`} className={styles.label}>
                  API key
                </span>
                <div className={styles.keyRow} role="group" aria-labelledby={`${id}-key-label`}>
                  <p className={`${styles.fixed} ${styles.grow}`}>
                    <Icon name="lock" size={16} />
                    {maskKey(savedKey ?? '')}
                  </p>
                  <button
                    type="button"
                    className={styles.quiet}
                    aria-label="Replace decision model key"
                    onClick={() => setReplacing(true)}
                  >
                    Replace
                  </button>
                </div>
                <p className={styles.small}>
                  {settings.rememberKeys ? 'Saved on this device.' : 'Kept for this tab only.'} Sent
                  only to <span className={styles.code}>{host}</span>.
                </p>
              </>
            ) : (
              <>
                <label htmlFor={`${id}-key`} className={styles.label}>
                  API key
                </label>
                <div className={styles.keyRow}>
                  <input
                    id={`${id}-key`}
                    ref={keyInput}
                    className={`${styles.input} ${styles.mono} ${styles.grow}`}
                    type={shown ? 'text' : 'password'}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={info.placeholder}
                    value={draftKey}
                    aria-describedby={`${id}-key-help`}
                    aria-invalid={status.kind === 'error' && status.rejected ? true : undefined}
                    onChange={(event) => setDraftKey(event.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.secondary}
                    aria-label={shown ? 'Hide key' : 'Show key'}
                    onClick={() => setShown(!shown)}
                  >
                    {shown ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p id={`${id}-key-help`} className={styles.small}>
                  {info.help}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {info ? (
        <TestRow
          status={status}
          connected={isSaved}
          connectedText="Connected · Jev"
          onTest={test}
          footnote={
            <>
              Your key is sent only to <span className={styles.code}>{host}</span>.
            </>
          }
        />
      ) : (
        <p className={styles.help}>
          Your general model
          {settings.general ? (
            <>
              {' '}
              (<span className={styles.code}>{settings.general.model}</span>)
            </>
          ) : null}{' '}
          will match rules and rank stories. Its confidence is self-reported, so Feedolio sends more
          items to Maybe.
        </p>
      )}
    </section>
  );
}

/**
 * Test connection, and how it went.
 *
 * @param {{
 *   status: TestStatus,
 *   connected: boolean,
 *   connectedText?: string,
 *   idleText?: string,
 *   onTest: () => void,
 *   footnote: import('react').ReactNode,
 * }} props
 */
function TestRow({
  status,
  connected,
  connectedText = 'Connected',
  idleText = 'Not tested yet',
  onTest,
  footnote,
}) {
  let text = idleText;
  let tone = styles.statusIdle;
  if (status.kind === 'testing') text = 'Testing…';
  else if (status.kind === 'error') {
    text = 'Not connected';
    tone = styles.statusError;
  } else if (status.kind === 'ok' && connected) {
    text = `Connected · ${status.detail}`;
    tone = styles.statusOk;
  } else if (connected) {
    text = connectedText;
    tone = styles.statusOk;
  }
  const ok = tone === styles.statusOk;

  return (
    <>
      <div className={styles.testRow}>
        <button
          type="button"
          className={styles.secondary}
          disabled={status.kind === 'testing'}
          onClick={onTest}
        >
          <Icon name="check" size={18} />
          Test connection
        </button>
        <span role="status" className={`${styles.status} ${tone}`}>
          {ok && <Icon name="check" size={14} />}
          {text}
        </span>
        {footnote && <span className={styles.small}>{footnote}</span>}
      </div>
      {status.kind === 'error' && (
        <p role="alert" className={styles.alert}>
          <Icon name="alert" size={18} />
          <span>{status.message}</span>
        </p>
      )}
    </>
  );
}

/** Which model does each job (§7.3). */
function WhichModel() {
  const { settings, decisionReady } = useAiContext();
  const model = settings.general ? (
    <>
      General model · <span className={styles.code}>{settings.general.model}</span>
    </>
  ) : (
    'General model · not connected yet'
  );
  const judge = decisionReady ? 'Decision model · Jev' : model;
  return (
    <section aria-labelledby="ai-routing" className={styles.card}>
      <div className={styles.cardHead}>
        <h2 id="ai-routing" className={styles.cardTitle}>
          Which model does what
        </h2>
        <p className={styles.help}>
          Feedolio picks the model for each job. Yes/no and scoring work goes to the decision model
          when you have one.
        </p>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Task</th>
              <th scope="col">Runs on</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Summarize, translate, explain</td>
              <td>{model}</td>
            </tr>
            <tr>
              <td>Group stories and write digest summaries</td>
              <td>{model}</td>
            </tr>
            <tr>
              <td>Match filter rules</td>
              <td>{judge}</td>
            </tr>
            <tr>
              <td>Rank Catch me up stories</td>
              <td>{judge}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

const FEATURES = /** @type {const} */ ([
  {
    name: 'actions',
    title: 'Article actions',
    help: 'Summarize, Translate and Explain on story pages.',
  },
  { name: 'rules', title: 'Filter rules', help: 'Check new stories against your rules.' },
  {
    name: 'catchUp',
    title: 'Catch me up',
    help: 'Build a digest of what you missed, grouped into stories.',
  },
]);

/** Which AI features are on, and Translate's language. */
function Features() {
  const dispatch = useDispatch();
  const { settings } = useAiContext();
  const id = useId();
  const names = languageNames();
  return (
    <section aria-labelledby={`${id}-title`} className={styles.card}>
      <h2 id={`${id}-title`} className={styles.cardTitle}>
        Features
      </h2>
      <ul className={styles.rows}>
        {FEATURES.map((feature) => (
          <li key={feature.name} className={styles.row}>
            <div className={styles.rowText}>
              <span id={`${id}-${feature.name}`} className={styles.rowTitle}>
                {feature.title}
              </span>
              <span id={`${id}-${feature.name}-help`} className={styles.small}>
                {feature.help}
                {feature.name === 'rules' && (
                  <>
                    {' '}
                    <Link to="/settings/rules">Edit them under Rules</Link>.
                  </>
                )}
              </span>
            </div>
            <label className={styles.switchLabel}>
              <input
                type="checkbox"
                role="switch"
                className={styles.switch}
                checked={settings.features[feature.name]}
                aria-labelledby={`${id}-${feature.name}`}
                aria-describedby={`${id}-${feature.name}-help`}
                onChange={() => dispatch(featureToggled(feature.name))}
              />
              <span aria-hidden="true">{settings.features[feature.name] ? 'On' : 'Off'}</span>
            </label>
          </li>
        ))}
        <li className={styles.row}>
          <div className={styles.rowText}>
            <label htmlFor={`${id}-language`} className={styles.rowTitle}>
              Translate into
            </label>
            <span id={`${id}-language-help`} className={styles.small}>
              The language the Translate button uses first.
            </span>
          </div>
          <div className={styles.languagePick}>
            <Select
              id={`${id}-language`}
              value={settings.translateTo}
              describedBy={`${id}-language-help`}
              onChange={(value) => dispatch(translateToChanged(value))}
              options={LANGUAGES.map((code) => ({ value: code, label: names(code) }))}
            />
          </div>
        </li>
      </ul>
    </section>
  );
}

/** What this session has used (US-113). */
function Usage() {
  const usage = useAiUsage();
  return (
    <section aria-labelledby="ai-usage" className={`${styles.card} ${styles.tight}`}>
      <h2 id="ai-usage" className={styles.cardTitle}>
        Usage this session
      </h2>
      <p className={styles.usage}>
        {usage.requests === 0
          ? 'No AI requests yet'
          : `${usage.requests} ${usage.requests === 1 ? 'request' : 'requests'} · about ${usage.tokensSent.toLocaleString('en')} tokens sent`}
      </p>
      <p className={styles.small}>
        Only the stories you use AI on, or that your rules check, are sent. Counted in this browser
        only. Your provider’s dashboard shows what you’re billed.
      </p>
    </section>
  );
}

/** Remove all keys (US-99). */
function DangerZone() {
  const dispatch = useDispatch();
  const { settings, userId } = useAiContext();
  const anything =
    Boolean(settings.general || settings.decision) ||
    Boolean(getKey(userId, 'general') || getKey(userId, 'decision'));
  return (
    <section
      aria-labelledby="ai-danger"
      className={`${styles.card} ${styles.tight} ${styles.dangerCard}`}
    >
      <h2 id="ai-danger" className={styles.cardTitle}>
        Danger zone
      </h2>
      <p className={styles.small}>
        Turns AI features off on this device. Your rules stay, so they work again when you add a
        key.
      </p>
      <button
        type="button"
        className={styles.danger}
        disabled={!anything}
        onClick={() => {
          removeAllKeys();
          dispatch(aiReset());
          dispatch(toastShown({ message: 'Removed all AI keys from this browser' }));
        }}
      >
        <Icon name="trash" size={18} />
        Remove all keys from this browser
      </button>
    </section>
  );
}

/**
 * A native select, drawn to match the other fields.
 *
 * @param {{
 *   id: string,
 *   value: string,
 *   onChange: (value: string) => void,
 *   options: { value: string, label: string }[],
 *   describedBy?: string,
 * }} props
 */
function Select({ id, value, onChange, options, describedBy }) {
  return (
    <div className={styles.selectWrap}>
      <select
        id={id}
        className={styles.select}
        value={value}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" size={16} className={styles.caret} />
    </div>
  );
}

/** A language's English name, with its own name beside it where they differ. */
function languageNames() {
  const english = new Intl.DisplayNames(['en'], { type: 'language' });
  return (/** @type {string} */ code) => {
    const name = english.of(code) ?? code;
    const own = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    return own && own.toLowerCase() !== name.toLowerCase() ? `${name} (${own})` : name;
  };
}
