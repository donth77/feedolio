/**
 * How sure a model must be before a rule acts (ADR-008). Jev's confidence is
 * calibrated; a general model's is self-reported, so its "Maybe" band is
 * wider and the reader decides more often.
 */
export const BANDS = {
  decision: { apply: 0.75, maybe: 0.4 },
  general: { apply: 0.85, maybe: 0.3 },
};

/**
 * @param {number} confidence  Probability of a match, 0 to 1
 * @param {'decision'|'general'} by
 * @returns {'match'|'maybe'|'no'}
 */
export function verdictFor(confidence, by) {
  const band = BANDS[by];
  if (confidence >= band.apply) return 'match';
  if (confidence >= band.maybe) return 'maybe';
  return 'no';
}

/**
 * Whether a rule acts on a story: the reader said yes, or the model matched
 * and the reader didn't say no.
 *
 * @param {{ verdict: 'match'|'maybe'|'no', readerSaid: 'yes'|'no'|null }} judgment
 */
export function applies({ verdict, readerSaid }) {
  return readerSaid === 'yes' || (readerSaid !== 'no' && verdict === 'match');
}

/**
 * A short name for a rule, from its wording: "Hide event announcements and
 * conference promotions" → "Event announcements".
 *
 * @param {string} text
 */
export function ruleLabel(text) {
  let label = text
    .trim()
    .replace(/^(please\s+)?(hide|highlight|tag|flag|mark|show)\s+(all\s+|any\s+)?/i, '')
    .replace(/\s+as\s+[“"']?[^“"']+[”"']?\.?$/i, '')
    .replace(/[.!]+$/, '');
  const cut = label.search(/,|;|\s+and\s+|\s+or\s+/i);
  if (cut > 8) label = label.slice(0, cut);
  if (label.length > 40) label = `${label.slice(0, 39).replace(/\s+\S*$/, '')}…`;
  return label ? label[0].toUpperCase() + label.slice(1) : text;
}
