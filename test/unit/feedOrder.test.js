import { describe, expect, it } from 'vitest';
import { dropIndex } from '../../src/features/subscriptions/feedReorder.js';
import subscriptions, {
  feedMoved,
  restoreSubscriptions,
  subscriptionAdded,
  subscriptionRemoved,
  subscriptionRestored,
} from '../../src/features/subscriptions/subscriptionsSlice.js';

/**
 * @param {string} id
 * @param {string} addedAt
 */
const feed = (id, addedAt) => ({
  id,
  url: `https://${id}.test/feed`,
  title: id.toUpperCase(),
  enabled: true,
  isDefault: false,
  addedAt,
});

// Saved in the reader's order, which isn't the order they were added in.
const SAVED = restoreSubscriptions([
  feed('a', '2026-01-03T00:00:00.000Z'),
  feed('b', '2026-01-01T00:00:00.000Z'),
  feed('c', '2026-01-02T00:00:00.000Z'),
]);

/** @param {ReturnType<typeof restoreSubscriptions>} state */
const order = (state) => state.ids;

describe('The order of feeds', () => {
  it('is the order they were saved in', () => {
    expect(order(SAVED)).toEqual(['a', 'b', 'c']);
  });

  it('changes when a feed moves, clamped to the list', () => {
    expect(order(subscriptions(SAVED, feedMoved({ id: 'a', to: 2 })))).toEqual(['b', 'c', 'a']);
    expect(order(subscriptions(SAVED, feedMoved({ id: 'c', to: 0 })))).toEqual(['c', 'a', 'b']);
    expect(order(subscriptions(SAVED, feedMoved({ id: 'a', to: 99 })))).toEqual(['b', 'c', 'a']);
    expect(order(subscriptions(SAVED, feedMoved({ id: 'c', to: -4 })))).toEqual(['c', 'a', 'b']);
    // A feed that isn't followed changes nothing.
    expect(subscriptions(SAVED, feedMoved({ id: 'zzz', to: 0 }))).toBe(SAVED);
  });

  it('puts a removed feed back where it was on Undo', () => {
    const removed = subscriptions(SAVED, subscriptionRemoved('b'));
    expect(order(removed)).toEqual(['a', 'c']);

    const back = subscriptions(removed, subscriptionRestored(SAVED.entities.b, 1));
    expect(order(back)).toEqual(['a', 'b', 'c']);
    expect(back.entities.b).toEqual(SAVED.entities.b);
  });

  it('puts new feeds last', () => {
    const added = subscriptions(
      SAVED,
      subscriptionAdded({ url: 'https://new.test/feed', title: 'New' }),
    );
    expect(order(added).slice(0, 3)).toEqual(['a', 'b', 'c']);
    expect(added.entities[order(added)[3]]?.title).toBe('New');
  });
});

describe('Where a dragged feed lands', () => {
  it('is after every other feed whose middle is above the pointer', () => {
    const middles = [10, 30, 50];
    expect(dropIndex(middles, 5)).toBe(0);
    expect(dropIndex(middles, 29)).toBe(1);
    expect(dropIndex(middles, 31)).toBe(2);
    expect(dropIndex(middles, 99)).toBe(3);
    expect(dropIndex([], 10)).toBe(0);
  });
});
