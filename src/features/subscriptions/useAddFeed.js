import { skipToken } from '@reduxjs/toolkit/query';
import { useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { feedApi, useGetFeedQuery } from '../feeds/feedApi.js';
import { addFeedProblem, toFeedAddress } from './addFeed.js';
import { selectSubscriptionByUrl, subscriptionAdded } from './subscriptionsSlice.js';

/** @typedef {import('../../lib/types.js').FeedResponse} FeedResponse */
/** @typedef {import('./subscriptionsSlice.js').Subscription} Subscription */

/**
 * Where adding a feed has got to.
 * - idle: nothing looked up yet
 * - checking: asking the feed endpoint about the link
 * - choosing: the page links to several feeds; one is picked and previewed
 * - ready: a feed was found and can be added
 * - followed: the reader already follows it
 * - problem: the link isn't usable
 *
 * @typedef {'idle'|'checking'|'choosing'|'ready'|'followed'|'problem'} AddFeedStatus
 */

/**
 * The add-a-feed flow: look up any link, preview the feed it leads to (or
 * offer a choice when a page has several), then follow it. The same flow
 * backs the Add feed dialog and the form in Settings.
 *
 * @param {{ onAdded: (subscription: { id: string, title: string }) => void }} options
 */
export function useAddFeed({ onAdded }) {
  const dispatch = useDispatch();
  const store = useStore();
  const [input, setInput] = useState('');
  const [address, setAddress] = useState(/** @type {string|null} */ (null));
  const [inputError, setInputError] = useState(/** @type {string|null} */ (null));
  const [knownId, setKnownId] = useState(/** @type {string|null} */ (null));
  const [choice, setChoice] = useState(/** @type {string|null} */ (null));

  const lookup = useGetFeedQuery(address ?? skipToken);
  const lookupData =
    /** @type {FeedResponse | { choices: { title: string, url: string }[] } | undefined} */ (
      lookup.data
    );
  const choices = lookupData && 'choices' in lookupData ? lookupData.choices : null;
  const chosenUrl = choices ? (choice ?? choices[0]?.url ?? null) : null;
  const chosen = useGetFeedQuery(chosenUrl ?? skipToken);

  const active = choices ? chosen : lookup;
  const activeData = /** @type {FeedResponse | object | undefined} */ (active.data);
  const preview =
    activeData && 'feed' in activeData && !active.isFetching
      ? /** @type {FeedResponse} */ (activeData)
      : null;

  // Already followed: known before looking up, or found once the feed is known.
  const followed = useSelector((state) => {
    if (knownId) return state.subscriptions.entities[knownId];
    return preview ? selectSubscriptionByUrl(state, preview.feed.url) : undefined;
  });

  /** @type {AddFeedStatus} */
  let status = 'idle';
  if (inputError) status = 'problem';
  else if (followed) status = 'followed';
  else if (address && lookup.isFetching) status = 'checking';
  else if (address && lookup.isError) status = 'problem';
  else if (choices) status = chosen.isError ? 'problem' : 'choosing';
  else if (preview) status = 'ready';

  const failure = choices ? chosen.error : lookup.error;
  const problem = inputError
    ? { title: inputError, detail: '' }
    : status === 'problem'
      ? addFeedProblem(failure)
      : null;

  const reset = () => {
    setInput('');
    setAddress(null);
    setInputError(null);
    setKnownId(null);
    setChoice(null);
  };

  return {
    input,
    status,
    problem,
    choices,
    chosenUrl,
    /** The feed to add, once it's known and not already followed. */
    preview: followed ? null : preview,
    /** The subscription the link leads to, when the reader already follows it. */
    followed,
    /** The chosen feed's preview is still loading. */
    previewing: Boolean(choices) && chosen.isFetching,
    /** @param {string} value */
    setInput(value) {
      setInput(value);
      setInputError(null);
    },
    /** @param {string} url */
    choose(url) {
      setChoice(url);
    },
    /** Looks up what the reader typed. */
    find() {
      const result = toFeedAddress(input);
      setChoice(null);
      if (result.error !== undefined) {
        setInputError(result.error);
        setAddress(null);
        setKnownId(null);
        return;
      }
      setInputError(null);
      const existing = selectSubscriptionByUrl(
        /** @type {import('../../app/store.js').RootState} */ (store.getState()),
        result.url,
      );
      if (existing) {
        setKnownId(existing.id);
        setAddress(null);
        return;
      }
      setKnownId(null);
      if (result.url === address && lookup.isError) lookup.refetch();
      setAddress(result.url);
    },
    /** Follows the previewed feed. */
    add() {
      if (!preview || followed) return;
      const { url, title } = preview.feed;
      // The preview already holds the feed's stories, so it shows at once.
      dispatch(feedApi.util.upsertQueryData('getFeed', url, preview));
      const action = dispatch(subscriptionAdded({ url, title }));
      reset();
      onAdded({ id: action.payload.id, title });
    },
    reset,
  };
}
