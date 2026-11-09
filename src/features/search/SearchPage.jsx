import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useLocation, useNavigate, useNavigationType } from 'react-router';
import Icon from '../../components/Icon.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import Segmented from '../../components/Segmented.jsx';
import listStyles from '../../components/StoryList.module.css';
import StoryRow from '../../components/StoryRow.jsx';
import { monogramFor, tintForId } from '../../lib/feeds.js';
import { takeOpenedStory } from '../../lib/returnFocus.js';
import { useNow } from '../../lib/useNow.js';
import { selectHiddenIds, selectStoryEffects } from '../ai/rules/ruleEffects.js';
import { HiddenNote } from '../ai/rules/RuleNotes.jsx';
import { selectAllBookmarks } from '../bookmarks/bookmarksSlice.js';
import { lookOf, mergeStories, useFeedStates, useLoadFeeds } from '../feeds/useFeeds.js';
import {
  selectAllSubscriptions,
  selectSubscriptionEntities,
} from '../subscriptions/subscriptionsSlice.js';
import { matchRanges, searchStories } from './matchStories.js';
import styles from './SearchPage.module.css';

/** @typedef {import('../feeds/useFeeds.js').ListedStory} ListedStory */

/** The search field's id: the / shortcut focuses it. */
export const SEARCH_FIELD_ID = 'search-field';

const MATCH = [
  { value: 'all', label: 'Title and summary' },
  { value: 'title', label: 'Titles only' },
];
const WHEN = [
  { value: 'any', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
];
const SINCE = { today: 86_400_000, week: 7 * 86_400_000 };

/**
 * Search, at /search (US-116 to US-119): the stories in the reader's feeds
 * now, plus everything saved, filtered by words. The query and filters live
 * in the address (?q=, in=, match=, when=), so Back returns to the results.
 */
export default function SearchPage() {
  // From the location, with the hooks the first page already has: a hook used
  // only here (useSearchParams) made the bundler split the first page's code.
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const q = params.get('q') ?? '';
  const match = params.get('match') === 'title' ? 'title' : 'all';
  const whenParam = params.get('when');
  const when = whenParam === 'today' || whenParam === 'week' ? whenParam : 'any';

  const subscriptions = useSelector(selectAllSubscriptions);
  const entities = useSelector(selectSubscriptionEntities);
  const bookmarks = useSelector(selectAllBookmarks);
  const hiddenIds = useSelector(selectHiddenIds);
  const effects = useSelector(selectStoryEffects);
  const inParam = params.get('in');
  const feedScope = inParam ? (entities[inParam] ?? null) : null;
  const scope = feedScope ? feedScope.id : inParam === 'saved' ? 'saved' : 'all';

  // The field runs ahead of the address while the reader types; a change of
  // address from elsewhere (Back, the / key) resets it.
  const [field, setField] = useState(q);
  const [seenQ, setSeenQ] = useState(q);
  if (q !== seenQ) {
    setSeenQ(q);
    if (q !== field) setField(q);
  }
  const query = useDeferredValue(field);

  /** @param {Record<string, string|null>} changes */
  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    navigate({ search: query ? `?${query}` : '' }, { replace: true, preventScrollReset: true });
  };
  /** @param {string} value */
  const changeQuery = (value) => {
    setField(value);
    update({ q: value.trim() ? value : null });
  };

  // What to search: the scope's feeds (loaded here if the shell doesn't), then
  // saved stories that aren't in them.
  const searched = useMemo(
    () =>
      feedScope
        ? [feedScope]
        : scope === 'saved'
          ? []
          : subscriptions.filter((subscription) => subscription.enabled),
    [feedScope, scope, subscriptions],
  );
  useLoadFeeds(searched);
  const states = useFeedStates(searched);
  const loading = states.some((state) => state.status === 'loading');
  const pool = useMemo(() => {
    const items = mergeStories(states);
    const seen = new Set(items.map(({ story }) => story.id));
    for (const bookmark of bookmarks) {
      if (seen.has(bookmark.id) || (feedScope && bookmark.feedId !== feedScope.id)) continue;
      const subscription = entities[bookmark.feedId];
      const feed = subscription
        ? lookOf(subscription)
        : /** @type {ListedStory['feed']} */ ({
            id: bookmark.feedId,
            title: bookmark.feedTitle,
            monogram: monogramFor(bookmark.feedTitle),
            tint: tintForId(bookmark.feedId),
          });
      items.push({ story: bookmark.story, feed });
    }
    return items;
  }, [states, bookmarks, entities, feedScope]);

  const now = useNow();
  const since = when === 'any' ? undefined : now - SINCE[when];
  const matches = useMemo(
    () => searchStories(pool, query, { titlesOnly: match === 'title', since }),
    [pool, query, match, since],
  );
  const results = matches.filter(({ story }) => !hiddenIds.has(story.id));
  const hidden = matches.length - results.length;

  /** @param {string} text @param {'title'|'excerpt'} part */
  const mark = (text, part) =>
    part === 'excerpt' && match === 'title' ? text : highlight(text, query);

  const input = useRef(/** @type {HTMLInputElement|null} */ (null));
  const list = useRef(/** @type {HTMLUListElement|null} */ (null));
  const navigation = useNavigationType();
  // Arriving starts typing; coming back from a story (or reloading) doesn't.
  // Only on arrival: changing a filter also navigates (replacing).
  const arrivedBy = useRef(navigation);
  useEffect(() => {
    if (arrivedBy.current !== 'POP') input.current?.focus();
  }, []);
  useEffect(() => {
    if (navigation !== 'POP' || results.length === 0) return;
    const storyId = takeOpenedStory();
    if (!storyId || !/^s_[0-9a-z]+$/.test(storyId)) return;
    const link = list.current?.querySelector(`[data-story-id="${storyId}"] a[data-story-link]`);
    if (link instanceof HTMLElement) link.focus({ preventScroll: true });
  }, [navigation, results]);

  const from = useMemo(
    () => ({ pathname: `${pathname}${search}`, label: 'Search' }),
    [pathname, search],
  );
  const scopeName = feedScope ? feedScope.title : scope === 'saved' ? 'Saved' : null;
  const narrowed = scope !== 'all' || when !== 'any' || match !== 'all';
  const searching = query.trim() !== '';

  return (
    <>
      <PageHeader title="Search" documentTitle={q.trim() ? `Search: ${q.trim()}` : 'Search'} />
      <form
        role="search"
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          list.current?.querySelector('a[data-story-link]')?.focus();
        }}
      >
        <div className={styles.field}>
          <Icon name="search" size={20} className={styles.fieldIcon} />
          <input
            ref={input}
            id={SEARCH_FIELD_ID}
            type="search"
            className={styles.input}
            value={field}
            aria-label="Search stories"
            placeholder="Search your feeds and saved stories"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            onChange={(event) => changeQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                if (field) changeQuery('');
                else input.current?.blur();
              } else if (event.key === 'ArrowDown') {
                const first = list.current?.querySelector('a[data-story-link]');
                if (first instanceof HTMLElement) {
                  event.preventDefault();
                  first.focus();
                }
              }
            }}
          />
          {field && (
            <button
              type="button"
              className={styles.clear}
              aria-label="Clear search"
              onClick={() => {
                changeQuery('');
                input.current?.focus();
              }}
            >
              <Icon name="close" size={18} />
            </button>
          )}
        </div>
        <div className={styles.filters}>
          <label className={styles.scope}>
            <span className={styles.scopeLabel}>Search in</span>
            <span className={styles.selectWrap}>
              <select
                id="search-scope"
                className={styles.select}
                value={scope}
                onChange={(event) =>
                  update({ in: event.target.value === 'all' ? null : event.target.value })
                }
              >
                <option value="all">All feeds</option>
                <option value="saved">Saved</option>
                <optgroup label="Feeds">
                  {subscriptions.map((subscription) => (
                    <option key={subscription.id} value={subscription.id}>
                      {subscription.title}
                    </option>
                  ))}
                </optgroup>
              </select>
              <Icon name="chevronDown" size={18} className={styles.caret} />
            </span>
          </label>
          <Segmented
            legend="Match"
            options={MATCH}
            value={match}
            onChange={(value) => update({ match: value === 'title' ? 'title' : null })}
          />
          <Segmented
            legend="Published"
            options={WHEN}
            value={when}
            onChange={(value) => update({ when: value === 'any' ? null : value })}
          />
        </div>
      </form>

      <p className={styles.count} role="status">
        {searching && !(loading && results.length === 0)
          ? `${results.length} ${results.length === 1 ? 'story matches' : 'stories match'}`
          : ''}
      </p>

      {!searching ? (
        <div className={styles.start}>
          <h2 className={styles.startTitle}>Search your feeds and saved stories</h2>
          <ul className={styles.tips}>
            <li>Every word must appear. Put &ldquo;quotes&rdquo; around an exact phrase.</li>
            <li>Narrow it to one feed or to Saved, to titles, or to today or this week.</li>
            <li>
              Press <kbd>/</kbd> to search from anywhere. On a feed&rsquo;s page, it searches that
              feed.
            </li>
          </ul>
        </div>
      ) : results.length > 0 ? (
        <ul ref={list} className={listStyles.list} aria-label="Search results">
          {results.map((item) => (
            <StoryRow
              key={item.story.id}
              item={item}
              now={now}
              from={from}
              headingLevel={2}
              effects={effects.get(item.story.id)}
              mark={mark}
            />
          ))}
        </ul>
      ) : loading ? (
        <p className={styles.covers}>Loading your stories…</p>
      ) : (
        <div className={styles.empty}>
          <Icon name="search" size={32} className={styles.emptyIcon} />
          <h2 className={styles.emptyTitle}>
            No stories match &ldquo;{query.trim()}&rdquo;{scopeName && ` in ${scopeName}`}
          </h2>
          <p className={styles.emptyText}>
            Search covers the stories in your feeds now and everything you&rsquo;ve saved.
          </p>
          <div className={styles.emptyActions}>
            {narrowed && (
              <button
                type="button"
                className={styles.primary}
                onClick={() => update({ in: null, match: null, when: null })}
              >
                Search all feeds
              </button>
            )}
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                changeQuery('');
                input.current?.focus();
              }}
            >
              Clear search
            </button>
          </div>
        </div>
      )}

      <HiddenNote hidden={hidden} />
      {searching && results.length > 0 && (
        <p className={styles.covers}>
          Search covers the stories in your feeds now and everything you&rsquo;ve saved.
        </p>
      )}
    </>
  );
}

/**
 * The text with the query's words and phrases marked, as React text.
 *
 * @param {string} text
 * @param {string} query
 */
function highlight(text, query) {
  const ranges = matchRanges(text, query);
  if (ranges.length === 0) return text;
  /** @type {import('react').ReactNode[]} */
  const parts = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(
      <mark key={start} className={styles.mark}>
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}
