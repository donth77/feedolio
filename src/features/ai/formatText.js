/**
 * Reads model output as plain text and finds the little structure worth
 * keeping: paragraphs, line breaks, bulleted and numbered lists, and bold or
 * italic words. Nothing in it is ever treated as HTML or as a link; the
 * component that draws these blocks only ever makes text nodes.
 */

/**
 * @typedef {{ type: 'paragraph', lines: string[] }
 *   | { type: 'heading', text: string }
 *   | { type: 'bullets', items: string[] }
 *   | { type: 'numbers', items: string[], start: number }} TextBlock
 */

/** @typedef {{ text: string, style: 'plain'|'bold'|'italic' }} TextRun */

const BULLET = /^[-*•]\s+(.*)$/;
const NUMBER = /^(\d{1,3})[.)]\s+(.*)$/;
const HEADING = /^#{1,6}\s+(.*)$/;

/**
 * Splits text into blocks.
 *
 * @param {string} text
 * @returns {TextBlock[]}
 */
export function textBlocks(text) {
  /** @type {TextBlock[]} */
  const blocks = [];
  /** @type {string[]} */
  let lines = [];
  /** @type {{ type: 'bullets', items: string[] } | { type: 'numbers', items: string[], start: number } | null} */
  let list = null;

  const endParagraph = () => {
    if (lines.length) blocks.push({ type: 'paragraph', lines });
    lines = [];
  };
  const endList = () => {
    if (list) blocks.push(list);
    list = null;
  };

  // A blank line ends a paragraph. A list goes on across blank lines, as
  // models often space out their bullets; any other line ends it.
  let gap = false;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) {
      endParagraph();
      gap = true;
      continue;
    }
    const bullet = BULLET.exec(line);
    const number = bullet ? null : NUMBER.exec(line);
    const heading = bullet || number ? null : HEADING.exec(line);
    if (bullet) {
      endParagraph();
      if (list?.type !== 'bullets') {
        endList();
        list = { type: 'bullets', items: [] };
      }
      list.items.push(bullet[1]);
    } else if (number) {
      endParagraph();
      if (list?.type !== 'numbers') {
        endList();
        list = { type: 'numbers', items: [], start: Number(number[1]) };
      }
      list.items.push(number[2]);
    } else if (heading) {
      endParagraph();
      endList();
      blocks.push({ type: 'heading', text: heading[1] });
    } else if (list && !gap && /^\s{2,}/.test(raw)) {
      // An indented line carries on the list item above it.
      list.items[list.items.length - 1] += ` ${line}`;
    } else {
      endList();
      lines.push(line);
    }
    gap = false;
  }
  endParagraph();
  endList();
  return blocks;
}

const EMPHASIS = /\*\*(.+?)\*\*|__(.+?)__|(?<![*\w])\*(?![\s*])([^*\n]*?[^\s*])\*(?![*\w])/g;

/**
 * Splits a line into plain, bold and italic runs, dropping the asterisks.
 *
 * @param {string} text
 * @returns {TextRun[]}
 */
export function textRuns(text) {
  /** @type {TextRun[]} */
  const runs = [];
  let last = 0;
  for (const match of text.matchAll(EMPHASIS)) {
    const at = match.index ?? 0;
    if (at > last) runs.push({ text: text.slice(last, at), style: 'plain' });
    const italic = match[3] !== undefined;
    runs.push({ text: match[1] ?? match[2] ?? match[3], style: italic ? 'italic' : 'bold' });
    last = at + match[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), style: 'plain' });
  return runs;
}

/**
 * The text without its formatting marks, for Copy.
 *
 * @param {string} text
 */
export function plainText(text) {
  return textBlocks(text)
    .map((block) => {
      const clean = (/** @type {string} */ line) =>
        textRuns(line)
          .map((run) => run.text)
          .join('');
      if (block.type === 'paragraph') return block.lines.map(clean).join('\n');
      if (block.type === 'heading') return clean(block.text);
      if (block.type === 'bullets') return block.items.map((item) => `• ${clean(item)}`).join('\n');
      return block.items.map((item, index) => `${block.start + index}. ${clean(item)}`).join('\n');
    })
    .join('\n\n');
}
