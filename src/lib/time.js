/**
 * Dates as a reader sees them, in their own time zone. Weeks start on Monday.
 */

/** @typedef {'today'|'yesterday'|'week'|'older'} DateGroup */

const DAY_GROUPS = /** @type {const} */ (['today', 'yesterday', 'week', 'older']);

export const GROUP_LABELS = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'Earlier this week',
  older: 'Older',
};

const longDay = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
});
const shortDay = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const monthDayYear = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const clock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const weekdayClock = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit',
});
const fullDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short' });

/** "5:52 PM" → "5:52 pm" */
const lowerMeridiem = (/** @type {string} */ text) =>
  text.replace(/\b([AP])M\b/, (m) => m.toLowerCase());

/** @param {number|Date} date */
function startOfDay(date) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

/**
 * @param {Date} date
 * @param {number} days
 */
function addDays(date, days) {
  const moved = new Date(date);
  moved.setDate(moved.getDate() + days);
  return moved;
}

/** Monday of the week `date` is in. @param {number|Date} date */
function startOfWeek(date) {
  const day = startOfDay(date);
  return addDays(day, -((day.getDay() + 6) % 7));
}

/**
 * Which date header a story belongs under. Undated stories go under Older;
 * stories dated in the future count as Today.
 *
 * @param {string|null} publishedAt
 * @param {number} now
 * @returns {DateGroup}
 */
export function dateGroupOf(publishedAt, now) {
  if (!publishedAt) return 'older';
  const time = Date.parse(publishedAt);
  const today = startOfDay(now);
  if (time >= today.getTime()) return 'today';
  if (time >= addDays(today, -1).getTime()) return 'yesterday';
  if (time >= startOfWeek(now).getTime()) return 'week';
  return 'older';
}

/**
 * The dates a header covers: "Friday, Nov 6", "Mon, Nov 2 to Wed, Nov 4",
 * "Before Nov 2".
 *
 * @param {DateGroup} group
 * @param {number} now
 */
export function groupDates(group, now) {
  const today = startOfDay(now);
  const yesterday = addDays(today, -1);
  const weekStart = startOfWeek(now);
  if (group === 'today') return longDay.format(today);
  if (group === 'yesterday') return longDay.format(yesterday);
  if (group === 'week') {
    const last = addDays(today, -2);
    return last.getTime() === weekStart.getTime()
      ? shortDay.format(weekStart)
      : `${shortDay.format(weekStart)} to ${shortDay.format(last)}`;
  }
  return `Before ${monthDay.format(weekStart < yesterday ? weekStart : yesterday)}`;
}

/**
 * When a story was published, as short as its date header allows:
 * "57 min ago" and "3h ago" today, "5:52 pm" yesterday, "Wed 10:13 pm" this
 * week, "Oct 27" or "Apr 24, 2020" before that.
 *
 * @param {string} publishedAt
 * @param {number} now
 */
export function storyTime(publishedAt, now) {
  const time = Date.parse(publishedAt);
  const group = dateGroupOf(publishedAt, now);
  if (group === 'today') {
    const minutes = Math.floor((now - time) / 60_000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  }
  if (group === 'yesterday') return lowerMeridiem(clock.format(time));
  if (group === 'week') return lowerMeridiem(weekdayClock.format(time));
  return new Date(time).getFullYear() === new Date(now).getFullYear()
    ? monthDay.format(time)
    : monthDayYear.format(time);
}

/**
 * When a story was published, for its own page: "Today, 8:02 pm",
 * "Yesterday, 5:52 pm", or the date, "Feb 28, 2020".
 *
 * @param {string} publishedAt
 * @param {number} now
 */
export function storyDate(publishedAt, now) {
  const time = Date.parse(publishedAt);
  const group = dateGroupOf(publishedAt, now);
  if (group === 'today') return `Today, ${lowerMeridiem(clock.format(time))}`;
  if (group === 'yesterday') return `Yesterday, ${lowerMeridiem(clock.format(time))}`;
  return monthDayYear.format(time);
}

/**
 * When the reader was last here, for the "New since your last visit" divider:
 * "Today 9:12 am", "Yesterday 5:52 pm", "Thu 3:00 pm", then "Oct 27".
 *
 * @param {string} visitedAt
 * @param {number} now
 */
export function visitLabel(visitedAt, now) {
  const time = Date.parse(visitedAt);
  const group = dateGroupOf(visitedAt, now);
  if (group === 'today') return `Today ${lowerMeridiem(clock.format(time))}`;
  if (group === 'yesterday') return `Yesterday ${lowerMeridiem(clock.format(time))}`;
  if (now - time < 7 * 86_400_000) return lowerMeridiem(weekdayClock.format(time));
  return new Date(time).getFullYear() === new Date(now).getFullYear()
    ? monthDay.format(time)
    : monthDayYear.format(time);
}

/**
 * How fresh a list is, after "Updated": "just now", "4 min ago", "2h ago".
 *
 * @param {string} fetchedAt
 * @param {number} now
 */
export function updatedLabel(fetchedAt, now) {
  const label = storyTime(fetchedAt, now);
  return label === 'Just now' ? 'just now' : label;
}

/**
 * When a story was saved, after "Saved": "today", "yesterday", "3 days ago",
 * then the date, "Oct 21".
 *
 * @param {string} savedAt
 * @param {number} now
 */
export function savedWhen(savedAt, now) {
  const time = Date.parse(savedAt);
  const days = Math.round((startOfDay(now).getTime() - startOfDay(time).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(time).getFullYear() === new Date(now).getFullYear()
    ? monthDay.format(time)
    : monthDayYear.format(time);
}

/** The exact time, for tooltips: "Friday, November 6, 2026 at 8:02 PM". @param {string} publishedAt */
export function fullTime(publishedAt) {
  return fullDate.format(Date.parse(publishedAt));
}

/** "Jan 3, 2018" @param {string} publishedAt */
export function shortDate(publishedAt) {
  return monthDayYear.format(Date.parse(publishedAt));
}

/**
 * Splits stories, newest first, into date groups in display order. Empty
 * groups are left out.
 *
 * @template {{ story: { publishedAt: string|null } }} T
 * @param {T[]} items
 * @param {number} now
 * @returns {{ group: DateGroup, items: T[] }[]}
 */
export function groupByDate(items, now) {
  const byGroup = new Map(DAY_GROUPS.map((group) => [group, /** @type {T[]} */ ([])]));
  for (const item of items) byGroup.get(dateGroupOf(item.story.publishedAt, now))?.push(item);
  return DAY_GROUPS.filter((group) => byGroup.get(group)?.length).map((group) => ({
    group,
    items: /** @type {T[]} */ (byGroup.get(group)),
  }));
}
