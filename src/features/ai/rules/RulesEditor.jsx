import { useEffect, useId, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router';
import { toastShown } from '../../../app/toastSlice.js';
import Icon from '../../../components/Icon.jsx';
import PageHeader from '../../../components/PageHeader.jsx';
import { storyTime } from '../../../lib/time.js';
import { useFocusAfterRemoval } from '../../../lib/useFocusAfterRemoval.js';
import { useNow } from '../../../lib/useNow.js';
import { mergeStories, useFeedStates } from '../../feeds/useFeeds.js';
import SettingsTabs from '../../subscriptions/SettingsTabs.jsx';
import { selectAllSubscriptions } from '../../subscriptions/subscriptionsSlice.js';
import { describeAiError } from '../errors.js';
import { DECISION_PROVIDERS, GENERAL_PROVIDERS, hostOf, isLocal } from '../providerInfo.js';
import { judge, roleFor } from '../router.js';
import { useAiContext } from '../useAi.js';
import { selectJudgmentEntities } from './judgmentsSlice.js';
import styles from './RulesEditor.module.css';
import {
  ruleAdded,
  ruleEdited,
  ruleRemoved,
  ruleRestored,
  ruleToggled,
  selectAllRules,
} from './rulesSlice.js';
import { applies, BANDS, verdictFor } from './verdicts.js';

/** @typedef {import('./rulesSlice.js').Rule} Rule */
/** @typedef {import('./rulesSlice.js').RuleAction} RuleAction */

/** How many recent stories "Test on recent stories" checks. */
const TEST_COUNT = 5;

/**
 * Settings › Rules (/settings/rules): plain-English filter rules that hide,
 * highlight or tag stories (US-104 to US-106). Nothing is ever deleted.
 */
export default function RulesEditor() {
  const dispatch = useDispatch();
  const rules = useSelector(selectAllRules);
  const { generalReady, decisionReady } = useAiContext();
  const list = useRef(/** @type {HTMLUListElement|null} */ (null));
  const heading = useRef(/** @type {HTMLHeadingElement|null} */ (null));
  const removing = useFocusAfterRemoval(list, 'button[data-edit]', heading, rules);

  return (
    <>
      <PageHeader
        title="Settings"
        documentTitle="Rules"
        description="Changes save automatically on this device."
      />
      <SettingsTabs />
      <div className={styles.page}>
        <section aria-labelledby="rules-title" className={styles.section}>
          <div className={styles.head}>
            <div className={styles.headText}>
              <h2 id="rules-title" ref={heading} tabIndex={-1} className={styles.title}>
                Filter rules
              </h2>
              <p className={styles.help}>
                Rules check new stories with AI. They can hide, highlight or tag stories. Nothing is
                ever deleted.
              </p>
            </div>
            {generalReady && <CheckedBy decision={decisionReady} />}
          </div>

          {!generalReady && (
            <p className={styles.notice} role="note">
              <Icon name="info" size={18} />
              <span>
                Rules need a general model to check stories.{' '}
                <Link to="/settings/ai">Set one up in Settings › AI</Link>. You can write rules now;
                they start checking once it’s connected.
              </span>
            </p>
          )}

          {rules.length > 0 && (
            <ul ref={list} className={styles.rules} aria-label="Your rules">
              {rules.map((rule, index) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  onRemove={() => {
                    removing(index);
                    dispatch(ruleRemoved(rule.id));
                    dispatch(
                      toastShown({
                        message: 'Rule removed. Stories it hid stay in Hidden.',
                        undo: ruleRestored(rule),
                      }),
                    );
                  }}
                />
              ))}
            </ul>
          )}
          {rules.length > 0 && (
            <p className={styles.small}>
              Removing a rule never removes stories. Hidden stories stay in Hidden until you unhide
              them.
            </p>
          )}
        </section>

        <section aria-labelledby="new-rule-title" className={styles.card}>
          <div className={styles.headText}>
            <h2 id="new-rule-title" className={styles.cardTitle}>
              New rule
            </h2>
            <p className={styles.help}>
              Write it the way you’d tell a friend. Test it on recent stories before you save it.
            </p>
          </div>
          <RuleForm
            onSave={(rule) => {
              dispatch(ruleAdded(rule));
              dispatch(toastShown({ message: 'Rule saved. It’s checking your stories now.' }));
            }}
          />
        </section>

        <HowMatchingWorks decision={decisionReady} />
      </div>
    </>
  );
}

/** @param {{ decision: boolean }} props */
function CheckedBy({ decision }) {
  return (
    <p className={styles.checkedBy}>
      <Icon name="sparkle" size={16} />
      {decision ? 'Checked by Jev (decision model)' : 'Checked by your general model'}
    </p>
  );
}

/**
 * One rule: its wording, on/off, what it has done, Edit and Remove.
 *
 * @param {{ rule: Rule, onRemove: () => void }} props
 */
function RuleCard({ rule, onRemove }) {
  const dispatch = useDispatch();
  const [editing, setEditing] = useState(false);
  const judgments = useSelector(selectJudgmentEntities);
  const editButton = useRef(/** @type {HTMLButtonElement|null} */ (null));
  // Closing the form puts focus back on Edit, once the card is back.
  const returning = useRef(false);
  const stats = statsFor(rule, judgments);

  useEffect(() => {
    if (editing || !returning.current) return;
    returning.current = false;
    editButton.current?.focus();
  }, [editing]);

  const close = () => {
    returning.current = true;
    setEditing(false);
  };

  if (editing) {
    return (
      <li className={styles.rule}>
        <RuleForm
          rule={rule}
          onSave={(changes) => {
            dispatch(ruleEdited({ id: rule.id, ...changes }));
            dispatch(toastShown({ message: 'Rule saved. It’s checking your stories again.' }));
            close();
          }}
          onCancel={close}
        />
      </li>
    );
  }

  return (
    <li className={styles.rule}>
      <div className={styles.ruleTop}>
        <p className={styles.ruleText}>“{rule.text}”</p>
        <label className={styles.switchLabel}>
          <input
            type="checkbox"
            role="switch"
            className={styles.switch}
            checked={rule.enabled}
            aria-label={`Rule on: ${rule.text}`}
            onChange={() => dispatch(ruleToggled(rule.id))}
          />
          <span aria-hidden="true">{rule.enabled ? 'On' : 'Off'}</span>
        </label>
      </div>
      <div className={styles.ruleMeta}>
        <span className={styles.actionChip} data-action={rule.action}>
          <Icon
            name={rule.action === 'hide' ? 'hidden' : rule.action === 'tag' ? 'tag' : 'sparkle'}
            size={14}
          />
          {rule.action === 'hide'
            ? 'Hide'
            : rule.action === 'tag'
              ? `Tag: ${rule.tag}`
              : 'Highlight'}
        </span>
        <span className={styles.small}>{stats.summary}</span>
        {stats.links.map((link) => (
          <Link key={link.to} to={link.to} className={styles.statLink}>
            {link.label}
          </Link>
        ))}
      </div>
      <div className={styles.ruleButtons}>
        <button
          ref={editButton}
          type="button"
          className={styles.secondary}
          data-edit=""
          onClick={() => setEditing(true)}
        >
          Edit <span className="visually-hidden">rule: {rule.text}</span>
        </button>
        <button type="button" className={styles.quiet} onClick={onRemove}>
          Remove rule<span className="visually-hidden">: {rule.text}</span>
        </button>
      </div>
    </li>
  );
}

/**
 * What a rule has done so far, as its card says it.
 *
 * @param {Rule} rule
 * @param {Record<string, import('./judgmentsSlice.js').Judgment>} judgments
 */
function statsFor(rule, judgments) {
  let acted = 0;
  let maybe = 0;
  for (const judgment of Object.values(judgments)) {
    if (judgment.ruleId !== rule.id || judgment.ruleVersion !== rule.version) continue;
    if (applies(judgment)) acted += 1;
    else if (judgment.verdict === 'maybe' && judgment.readerSaid === null) maybe += 1;
  }
  const verb = rule.action === 'hide' ? 'hidden' : rule.action === 'tag' ? 'tagged' : 'highlighted';
  const summary = `${acted} ${verb}${maybe ? ` · ${maybe} in Maybe` : ''}`;
  /** @type {{ to: string, label: string }[]} */
  const links = [];
  if (rule.action === 'hide' && acted)
    links.push({ to: '/hidden', label: `View Hidden (${acted})` });
  if (rule.action === 'tag' && rule.tag && acted) {
    links.push({
      to: `/tags/${encodeURIComponent(rule.tag)}`,
      label: `View ${rule.tag} (${acted})`,
    });
  }
  if (rule.action === 'highlight' && acted) links.push({ to: '/', label: 'View in All stories' });
  if (maybe) links.push({ to: '/maybe', label: `Review Maybe (${maybe})` });
  return { summary, links };
}

/**
 * Writing a rule, or changing one: its wording, what it does, and a test on
 * recent stories before saving (US-106).
 *
 * @param {{
 *   rule?: Rule,
 *   onSave: (rule: { text: string, action: RuleAction, tag: string|null }) => void,
 *   onCancel?: () => void,
 * }} props
 */
function RuleForm({ rule, onSave, onCancel }) {
  const id = useId();
  const context = useAiContext();
  const subscriptions = useSelector(selectAllSubscriptions);
  const states = useFeedStates(subscriptions);
  const now = useNow();
  const [text, setText] = useState(rule?.text ?? '');
  const [action, setAction] = useState(/** @type {RuleAction} */ (rule?.action ?? 'hide'));
  const [tag, setTag] = useState(rule?.tag ?? '');
  const [problem, setProblem] = useState(
    /** @type {{ field: 'text'|'tag', message: string }|null} */ (null),
  );
  const [test, setTest] = useState(
    /** @type {{ status: 'idle'|'testing'|'done'|'error', results?: any[], by?: 'decision'|'general', message?: string }} */ ({
      status: 'idle',
    }),
  );
  const textField = useRef(/** @type {HTMLTextAreaElement|null} */ (null));
  const tagField = useRef(/** @type {HTMLInputElement|null} */ (null));
  const attempt = useRef(0);

  /** @returns {boolean} */
  function check() {
    if (text.trim().length < 3) {
      setProblem({ field: 'text', message: 'Describe what the rule should match.' });
      textField.current?.focus();
      return false;
    }
    if (action === 'tag' && !tag.trim()) {
      setProblem({ field: 'tag', message: 'Give the tag a name.' });
      tagField.current?.focus();
      return false;
    }
    setProblem(null);
    return true;
  }

  async function runTest() {
    if (!check()) return;
    const recent = mergeStories(states).slice(0, TEST_COUNT);
    const mine = ++attempt.current;
    setTest({ status: 'testing' });
    try {
      const result = await judge(
        {
          rule: text.trim(),
          stories: recent.map(({ story, feed }) => ({
            id: story.id,
            title: story.title,
            text: story.excerpt,
            feedTitle: feed.title,
          })),
        },
        context,
      );
      if (mine !== attempt.current) return;
      const confidence = new Map(
        result.judgments.map((judgment) => [judgment.id, judgment.confidence]),
      );
      setTest({
        status: 'done',
        by: result.by,
        results: recent.map((item) => ({ ...item, confidence: confidence.get(item.story.id) })),
      });
    } catch (error) {
      if (mine !== attempt.current) return;
      const { general, decision } = context.settings;
      const where =
        roleFor('match', context) === 'decision' && decision
          ? {
              label: DECISION_PROVIDERS[decision.provider].label,
              host: hostOf(DECISION_PROVIDERS[decision.provider].baseUrl),
              decision: decision.provider,
            }
          : {
              label: general ? GENERAL_PROVIDERS[general.provider].label : 'Your provider',
              host: general ? hostOf(general.baseUrl) : '',
              local: general ? isLocal(general.baseUrl) : false,
            };
      setTest({ status: 'error', message: describeAiError(error, where) });
    }
  }

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!check()) return;
        onSave({ text: text.trim(), action, tag: action === 'tag' ? tag.trim() : null });
        if (!rule) {
          setText('');
          setTag('');
          setTest({ status: 'idle' });
        }
      }}
    >
      <div className={styles.field}>
        <label htmlFor={`${id}-text`} className={styles.label}>
          Describe what to match, in plain English
        </label>
        <textarea
          id={`${id}-text`}
          ref={textField}
          className={styles.textarea}
          rows={3}
          value={text}
          placeholder="Stories about AI data centers and the energy they use"
          aria-invalid={problem?.field === 'text' ? true : undefined}
          aria-describedby={problem?.field === 'text' ? `${id}-problem` : undefined}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <div className={styles.formRow}>
        <div className={styles.field}>
          <label htmlFor={`${id}-action`} className={styles.label}>
            Then
          </label>
          <div className={styles.selectWrap}>
            <select
              id={`${id}-action`}
              className={styles.select}
              value={action}
              onChange={(event) => setAction(/** @type {RuleAction} */ (event.target.value))}
            >
              <option value="hide">Hide</option>
              <option value="highlight">Highlight</option>
              <option value="tag">Tag as…</option>
            </select>
            <Icon name="chevronDown" size={16} className={styles.caret} />
          </div>
        </div>
        {action === 'tag' && (
          <div className={styles.field}>
            <label htmlFor={`${id}-tag`} className={styles.label}>
              Tag name
            </label>
            <input
              id={`${id}-tag`}
              ref={tagField}
              className={styles.input}
              type="text"
              maxLength={30}
              value={tag}
              placeholder="Funding"
              aria-invalid={problem?.field === 'tag' ? true : undefined}
              aria-describedby={problem?.field === 'tag' ? `${id}-problem` : undefined}
              onChange={(event) => setTag(event.target.value)}
            />
          </div>
        )}
      </div>
      {problem && (
        <p id={`${id}-problem`} className={styles.problem} role="alert">
          {problem.message}
        </p>
      )}
      <div className={styles.formButtons}>
        <button
          type="button"
          className={styles.secondary}
          disabled={!context.generalReady || test.status === 'testing'}
          onClick={() => void runTest()}
        >
          <Icon name="check" size={18} />
          {test.status === 'testing' ? 'Testing…' : 'Test on recent stories'}
        </button>
        <button type="submit" className={styles.primary}>
          {rule ? 'Save changes' : 'Save rule'}
        </button>
        {onCancel && (
          <button type="button" className={styles.quiet} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {!context.generalReady && (
        <p className={styles.small}>Testing needs a general model, set up in Settings › AI.</p>
      )}
      <TestResults test={test} now={now} />
    </form>
  );
}

/**
 * @param {{
 *   test: { status: string, results?: any[], by?: 'decision'|'general', message?: string },
 *   now: number,
 * }} props
 */
function TestResults({ test, now }) {
  const counts = { match: 0, maybe: 0 };
  for (const { confidence } of test.results ?? []) {
    if (typeof confidence !== 'number') continue;
    const verdict = verdictFor(confidence, test.by ?? 'general');
    if (verdict !== 'no') counts[verdict] += 1;
  }
  return (
    <div className={styles.testResults}>
      <p role="status" className="visually-hidden">
        {test.status === 'testing'
          ? 'Testing on recent stories…'
          : test.status === 'done'
            ? `Test finished: ${counts.match} would match, ${counts.maybe} would go to Maybe.`
            : ''}
      </p>
      {test.status === 'error' && (
        <p className={styles.alert} role="alert">
          <Icon name="alert" size={18} />
          {test.message}
        </p>
      )}
      {test.status === 'done' && test.results && (
        <>
          <div className={styles.testHead}>
            <p className={styles.testTitle}>
              Test results · {test.results.length} recent{' '}
              {test.results.length === 1 ? 'story' : 'stories'}
            </p>
            <CheckedBy decision={test.by === 'decision'} />
          </div>
          <ul className={styles.results} aria-label="Test results">
            {test.results.map(({ story, feed, confidence }) => {
              const verdict =
                typeof confidence === 'number'
                  ? verdictFor(confidence, test.by ?? 'general')
                  : null;
              return (
                <li key={story.id} className={styles.result}>
                  <div className={styles.resultText}>
                    <span className={styles.small}>
                      {feed.title}
                      {story.publishedAt && ` · ${storyTime(story.publishedAt, now)}`}
                    </span>
                    <span className={styles.resultTitle}>{story.title}</span>
                  </div>
                  <span className={styles.verdict} data-verdict={verdict ?? 'none'}>
                    {verdict === 'match'
                      ? 'Match'
                      : verdict === 'maybe'
                        ? 'Maybe'
                        : verdict === 'no'
                          ? 'No'
                          : 'No answer'}
                    {typeof confidence === 'number' && ` · ${Math.round(confidence * 100)}%`}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * The confidence bands, for the model that's judging.
 *
 * @param {{ decision: boolean }} props
 */
function HowMatchingWorks({ decision }) {
  const band = decision ? BANDS.decision : BANDS.general;
  const maybe = Math.round(band.maybe * 100);
  const apply = Math.round(band.apply * 100);
  return (
    <details className={styles.details}>
      <summary className={styles.summary}>
        <Icon name="info" size={18} />
        How matching works
      </summary>
      <div className={styles.detailsBody}>
        <div
          className={styles.scale}
          role="img"
          aria-label={`Confidence scale: below ${maybe} percent ignored, ${maybe} to ${apply} percent goes to Maybe, ${apply} percent or more the rule applies`}
        >
          <span className={styles.scaleNo} style={{ flexBasis: `${maybe}%` }} />
          <span className={styles.scaleMaybe} style={{ flexBasis: `${apply - maybe}%` }} />
          <span className={styles.scaleMatch} style={{ flexBasis: `${100 - apply}%` }} />
        </div>
        <ul className={styles.bands}>
          <li>{apply}% or more: the rule applies.</li>
          <li>
            {maybe}–{apply}%: the story goes to Maybe for you to decide.
          </li>
          <li>Below {maybe}%: ignored.</li>
        </ul>
        <p className={styles.help}>
          {decision
            ? 'Jev’s confidence is calibrated. Without a decision model, your general model reports its own confidence, so Feedolio uses a wider Maybe band: 30–85%.'
            : 'Your general model reports its own confidence, so Feedolio uses a wide Maybe band. With Jev as a decision model, the band narrows to 40–75%.'}
        </p>
        <p className={styles.help}>
          Each story is checked once per version of a rule; editing a rule checks stories again.
          Nothing is ever deleted: hidden stories stay in Hidden, and you can unhide them at any
          time.
        </p>
      </div>
    </details>
  );
}
