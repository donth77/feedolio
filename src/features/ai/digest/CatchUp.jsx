import { useEffect, useId, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router';
import { toastShown } from '../../../app/toastSlice.js';
import {
  catchUpRestored,
  caughtUp,
  selectLastCatchUpAt,
  selectOpenedIds,
} from '../../../app/visitsSlice.js';
import Icon from '../../../components/Icon.jsx';
import { FeedDot } from '../../../components/Monogram.jsx';
import PageHeader from '../../../components/PageHeader.jsx';
import { EmptyState } from '../../../components/StoryList.jsx';
import { rememberOpenedStory } from '../../../lib/returnFocus.js';
import { fullTime, storyTime, updatedLabel } from '../../../lib/time.js';
import { useNow } from '../../../lib/useNow.js';
import BookmarkButton from '../../bookmarks/BookmarkButton.jsx';
import { mergeStories, useFeedStates } from '../../feeds/useFeeds.js';
import { selectEnabledSubscriptions } from '../../subscriptions/subscriptionsSlice.js';
import { readCached, writeCached } from '../cache.js';
import { describeAiError } from '../errors.js';
import FormattedText from '../FormattedText.jsx';
import { DECISION_PROVIDERS, GENERAL_PROVIDERS, hostOf, isLocal } from '../providerInfo.js';
import { roleFor } from '../router.js';
import { selectHiddenIds } from '../rules/ruleEffects.js';
import { useAiContext } from '../useAi.js';
import { buildDigest, digestKey, importanceLabel, MAX_DIGEST_STORIES } from './buildDigest.js';
import styles from './CatchUp.module.css';

/** @typedef {import('./buildDigest.js').Digest} Digest */
/** @typedef {import('./buildDigest.js').DigestStep} DigestStep */
/** @typedef {import('../../feeds/useFeeds.js').ListedStory} ListedStory */

/** Before the first catch-up, the digest looks back a week. */
const FIRST_WINDOW_MS = 7 * 86_400_000;
/** "Everything else" shows this many until the reader asks for all. */
const OTHERS_SHOWN = 5;

/**
 * @typedef {{ status: 'idle' }
 *   | { status: 'building', step: DigestStep|null }
 *   | { status: 'done', digest: Digest }
 *   | { status: 'error', error: unknown, step: DigestStep|null }} View
 */

/**
 * Catch me up, at /catch-up (US-109 to US-112): the unread stories since the
 * last catch-up, grouped into main stories, ranked by importance and
 * summarised, with links to the stories in Feedolio.
 */
export default function CatchUp() {
  const dispatch = useDispatch();
  const context = useAiContext();
  const { settings, generalReady, userId } = context;
  const subscriptions = useSelector(selectEnabledSubscriptions);
  const states = useFeedStates(subscriptions);
  const loading = states.some((state) => state.status === 'loading');
  const lastCatchUpAt = useSelector(selectLastCatchUpAt);
  const openedIds = useSelector(selectOpenedIds);
  const hiddenIds = useSelector(selectHiddenIds);
  const now = useNow();
  const [openedAt] = useState(() => Date.now());
  const [view, setView] = useState(/** @type {View} */ ({ status: 'idle' }));
  const running = useRef(/** @type {AbortController|null} */ (null));
  const allCaughtUp = useRef(/** @type {HTMLAnchorElement|null} */ (null));
  const start = useRef(/** @type {HTMLButtonElement|null} */ (null));
  // After "Mark all caught up", focus moves to what the page shows next.
  const focusNext = useRef(false);

  // Unread: in the window, not opened, not hidden; the newest 60.
  const windowStart = lastCatchUpAt ?? new Date(openedAt - FIRST_WINDOW_MS).toISOString();
  const all = mergeStories(states);
  const byId = new Map(all.map((item) => [item.story.id, item]));
  const opened = new Set(openedIds);
  const unread = all.filter(
    ({ story }) => story.publishedAt && story.publishedAt > windowStart && !opened.has(story.id),
  );
  const hiddenCount = unread.filter(({ story }) => hiddenIds.has(story.id)).length;
  const visible = unread.filter(({ story }) => !hiddenIds.has(story.id));
  const candidates = visible.slice(0, MAX_DIGEST_STORIES);
  const general = settings.general;
  const key = digestKey({
    scope: userId,
    window: lastCatchUpAt ?? 'recent',
    model: general?.model ?? '',
  });

  // A digest already made for this window shows straight away.
  useEffect(() => {
    if (!generalReady) return;
    let live = true;
    void readCached('answers', key).then((saved) => {
      if (live && saved) setView({ status: 'done', digest: /** @type {Digest} */ (saved) });
    });
    return () => {
      live = false;
    };
  }, [key, generalReady]);

  useEffect(() => () => running.current?.abort(), []);

  useEffect(() => {
    const next = allCaughtUp.current ?? start.current;
    if (!focusNext.current || !next) return;
    focusNext.current = false;
    next.focus();
  });

  if (!general || !settings.features.catchUp || !generalReady) {
    return (
      <>
        <PageHeader title="Catch me up" />
        <EmptyState
          title={
            !general
              ? 'Catch me up needs AI'
              : !settings.features.catchUp
                ? 'Catch me up is off'
                : 'Paste your key again'
          }
          icon="sparkle"
          action={{ to: '/settings/ai', label: 'Open Settings › AI' }}
        >
          {!general
            ? 'Connect a general model in Settings › AI, and Feedolio can group what you missed into main stories.'
            : !settings.features.catchUp
              ? 'Turn it back on in Settings › AI.'
              : 'Your key was kept for one tab only, and that tab was closed.'}
        </EmptyState>
      </>
    );
  }

  async function build() {
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    setView({ status: 'building', step: null });
    /** @type {DigestStep|null} */
    let lastStep = null;
    try {
      const digest = await buildDigest(
        {
          stories: candidates.map(({ story, feed }) => ({
            id: story.id,
            title: story.title,
            text: story.excerpt,
            feedTitle: feed.title,
          })),
          signal: controller.signal,
          onStep: (step) => {
            lastStep = step;
            if (running.current === controller) setView({ status: 'building', step });
          },
        },
        context,
      );
      if (running.current !== controller) return;
      setView({ status: 'done', digest });
      void writeCached('answers', key, digest);
    } catch (error) {
      if (running.current !== controller || controller.signal.aborted) return;
      setView({ status: 'error', error, step: lastStep });
    }
  }

  function markCaughtUp() {
    running.current?.abort();
    dispatch(caughtUp());
    dispatch(
      toastShown({
        message: 'All caught up. The next digest starts from now.',
        undo: catchUpRestored(lastCatchUpAt),
      }),
    );
    setView({ status: 'idle' });
    focusNext.current = true;
  }

  const since = lastCatchUpAt
    ? `Since your last catch-up on ${fullTime(lastCatchUpAt)}`
    : 'From the last week';
  const count = `${visible.length} unread ${visible.length === 1 ? 'story' : 'stories'}`;

  if (view.status === 'done') {
    const { digest } = view;
    const newer = candidates.filter(({ story }) => !digest.storyIds.includes(story.id)).length;
    return (
      <DigestView
        digest={digest}
        description={`${since} · ${digest.storyIds.length} stories · ${digest.groups.length} main ${digest.groups.length === 1 ? 'story' : 'stories'}`}
        byId={byId}
        hiddenIds={hiddenIds}
        hiddenCount={hiddenCount}
        newer={newer}
        now={now}
        onRegenerate={() => void build()}
        onCaughtUp={markCaughtUp}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Catch me up"
        description={
          loading && candidates.length === 0 ? 'Loading your stories…' : `${since} · ${count}`
        }
      />
      {!loading && candidates.length === 0 ? (
        <EmptyState
          title="You’re all caught up"
          icon="check"
          action={{ to: '/', label: 'Back to All stories' }}
          actionRef={allCaughtUp}
        >
          New stories will be here for your next catch-up.
        </EmptyState>
      ) : view.status === 'building' ? (
        <Building step={view.step} />
      ) : (
        <section aria-labelledby="catch-up-start" className={styles.start}>
          <h2 id="catch-up-start" className={styles.startTitle}>
            What you missed
          </h2>
          <p className={styles.help}>
            Feedolio groups your unread stories into main stories, ranks them by importance and
            summarises each, using {whose(general)}. It sends their titles and summaries: up to 10
            requests.
            {visible.length > MAX_DIGEST_STORIES &&
              ` It covers the newest ${MAX_DIGEST_STORIES} of your ${visible.length} unread stories.`}
          </p>
          {view.status === 'error' && (
            <p role="alert" className={styles.alert}>
              <Icon name="alert" size={18} />
              <span>
                {describeAiError(view.error, whereOf(context, view.step))}{' '}
                <Link to="/settings/ai">AI settings</Link>
              </span>
            </p>
          )}
          <button
            ref={start}
            type="button"
            className={styles.primary}
            disabled={loading || candidates.length === 0}
            onClick={() => void build()}
          >
            <Icon name="sparkle" size={18} />
            {view.status === 'error' ? 'Try again' : 'Catch me up'}
          </button>
          {hiddenCount > 0 && <HiddenNote count={hiddenCount} />}
        </section>
      )}
    </>
  );
}

/**
 * The digest: main stories, most important first, then everything else.
 *
 * @param {{
 *   digest: Digest,
 *   description: string,
 *   byId: Map<string, ListedStory>,
 *   hiddenIds: Set<string>,
 *   hiddenCount: number,
 *   newer: number,
 *   now: number,
 *   onRegenerate: () => void,
 *   onCaughtUp: () => void,
 * }} props
 */
function DigestView({
  digest,
  description,
  byId,
  hiddenIds,
  hiddenCount,
  newer,
  now,
  onRegenerate,
  onCaughtUp,
}) {
  const id = useId();
  const [showAll, setShowAll] = useState(false);
  /** @param {string[]} ids */
  const listed = (ids) =>
    ids.flatMap((storyId) => {
      const item = byId.get(storyId);
      return item && !hiddenIds.has(storyId) ? [item] : [];
    });
  const others = listed(digest.others);
  const shownOthers = showAll ? others : others.slice(0, OTHERS_SHOWN);

  return (
    <>
      <PageHeader
        title="Catch me up"
        description={description}
        actions={
          <button type="button" className={styles.secondary} onClick={onRegenerate}>
            <Icon name="refresh" size={18} />
            Regenerate
          </button>
        }
      />
      <p className={styles.provenance}>
        <Icon name="sparkle" size={16} />
        {digest.rankedBy === 'decision'
          ? 'Ranked by Jev (decision model)'
          : 'Ranked by your general model'}{' '}
        · Summaries by {digest.model} · Generated {updatedLabel(digest.generatedAt, now)}
      </p>
      {newer > 0 && (
        <p className={styles.newer}>
          {newer} new {newer === 1 ? 'story' : 'stories'} since this digest.{' '}
          <button type="button" className={styles.inline} onClick={onRegenerate}>
            Regenerate to include {newer === 1 ? 'it' : 'them'}
          </button>
        </p>
      )}

      {digest.groups.length > 0 ? (
        <ol className={styles.groups} aria-label="Main stories, most important first">
          {digest.groups.map((group, index) => {
            const sources = listed(group.storyIds);
            const label = importanceLabel(group.importance);
            return (
              <li key={group.id} className={styles.card}>
                <p className={styles.cardTop}>
                  <span className={styles.rank} aria-hidden="true">
                    {index + 1}
                  </span>
                  {label && (
                    <span className={styles.importance} data-level={label}>
                      {label}
                    </span>
                  )}
                  {group.importance !== null && (
                    <span className={styles.score}>Importance {group.importance} of 100</span>
                  )}
                </p>
                <h2 className={styles.headline}>{group.headline}</h2>
                {group.summary && <FormattedText text={group.summary} className={styles.summary} />}
                <h3 className={styles.sourcesTitle}>Sources ({sources.length})</h3>
                <ul className={styles.sources}>
                  {sources.map((item) => (
                    <SourceRow key={item.story.id} item={item} now={now} />
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={styles.help}>No main stories stood out this time; they’re all below.</p>
      )}

      {others.length > 0 && (
        <section aria-labelledby={`${id}-others`} className={styles.others}>
          <div className={styles.othersHead}>
            <h2 id={`${id}-others`} className={styles.othersTitle}>
              Everything else ({others.length})
            </h2>
            <p className={styles.help}>Stories that didn’t fit a main story</p>
          </div>
          <ul className={styles.sources}>
            {shownOthers.map((item) => (
              <SourceRow key={item.story.id} item={item} now={now} />
            ))}
          </ul>
          {others.length > OTHERS_SHOWN && (
            <button
              type="button"
              className={styles.secondary}
              aria-expanded={showAll}
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? 'Show fewer' : `Show all ${others.length}`}
            </button>
          )}
        </section>
      )}

      {hiddenCount > 0 && <HiddenNote count={hiddenCount} />}

      <footer className={styles.footer}>
        <button type="button" className={styles.primary} onClick={onCaughtUp}>
          <Icon name="check" size={18} />
          Mark all caught up
        </button>
        <p className={styles.help}>
          Links open the stories in Feedolio. AI can make mistakes; check the sources.
        </p>
      </footer>
    </>
  );
}

/**
 * One source: where and when, the headline (a link to the story in Feedolio,
 * from Feedolio's own data), and Save.
 *
 * @param {{ item: ListedStory, now: number }} props
 */
function SourceRow({ item, now }) {
  const { story, feed } = item;
  return (
    <li className={styles.source}>
      <FeedDot feed={feed} />
      <div className={styles.sourceText}>
        <p className={styles.sourceMeta}>
          {feed.title}
          {story.publishedAt && ` · ${storyTime(story.publishedAt, now)}`}
        </p>
        <Link
          to={`/feeds/${story.feedId}/stories/${story.id}`}
          state={{ from: { pathname: '/catch-up', label: 'Catch me up' } }}
          className={styles.sourceLink}
          onClick={() => rememberOpenedStory(story.id)}
        >
          {story.title}
        </Link>
      </div>
      <BookmarkButton story={story} feedTitle={feed.title} />
    </li>
  );
}

/** @param {{ step: DigestStep|null }} props */
function Building({ step }) {
  const text =
    step?.step === 'ranking'
      ? `Ranking ${step.groups} main stories…`
      : step?.step === 'summarising'
        ? `Writing summaries (${step.done} of ${step.groups})…`
        : `Grouping ${step?.stories ?? ''} stories into main stories…`.replace('  ', ' ');
  return (
    <div className={styles.building} aria-busy="true">
      <p role="status" className={styles.buildingText}>
        <Icon name="sparkle" size={18} />
        {text}
      </p>
      {[0, 1, 2].map((n) => (
        <div key={n} className={styles.skeletonCard} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

/** @param {{ count: number }} props */
function HiddenNote({ count }) {
  return (
    <p className={styles.hiddenNote} role="note">
      <Icon name="hidden" size={18} />
      <span>
        {count} {count === 1 ? 'story' : 'stories'} hidden by your rules{' '}
        {count === 1 ? 'isn’t' : 'aren’t'} included. <Link to="/hidden">Review Hidden</Link>
      </span>
    </p>
  );
}

/**
 * Whose model it is, as the page says it.
 *
 * @param {import('../aiSettingsSlice.js').GeneralSettings} general
 */
function whose(general) {
  if (general.provider === 'ollama') return 'Ollama on this computer';
  if (general.provider === 'custom') return 'your own server';
  return `your ${GENERAL_PROVIDERS[general.provider].label} key`;
}

/**
 * Which provider a failure came from, for its message: the decision model
 * while ranking, if there is one, and the general model otherwise.
 *
 * @param {import('../router.js').AiContext} context
 * @param {DigestStep|null} step  The step that failed
 */
function whereOf(context, step) {
  const { general, decision } = context.settings;
  if (step?.step === 'ranking' && roleFor('rank', context) === 'decision' && decision) {
    return {
      label: DECISION_PROVIDERS[decision.provider].label,
      host: hostOf(DECISION_PROVIDERS[decision.provider].baseUrl),
      decision: decision.provider,
    };
  }
  return {
    label: general ? GENERAL_PROVIDERS[general.provider].label : 'Your provider',
    host: general ? hostOf(general.baseUrl) : '',
    local: general ? isLocal(general.baseUrl) : false,
  };
}
