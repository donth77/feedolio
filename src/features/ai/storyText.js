/**
 * A story's text, as the plain text a model reads: paragraphs, headings and
 * list items on their own lines, and nothing that isn't words (images,
 * embedded media placeholders).
 */

const BLOCKS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DD',
  'DIV',
  'DL',
  'DT',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TR',
  'UL',
]);

/** About 15,000 words: far more than a news story, and a cap on the cost. */
export const MAX_STORY_CHARS = 100_000;

/**
 * @param {Node} root  A cleaned story fragment (see cleanStoryHtml)
 */
export function storyPlainText(root) {
  let text = '';
  /** @param {Node} node */
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        text += (child.nodeValue ?? '').replace(/\s+/g, ' ');
        continue;
      }
      if (child.nodeType !== 1) continue;
      const element = /** @type {Element} */ (child);
      const tag = element.tagName.toUpperCase();
      if (tag === 'BR') {
        text += '\n';
        continue;
      }
      // Pictures and embedded-media placeholders carry no story text.
      if (tag === 'IMG' || element.hasAttribute('data-embed')) continue;
      if (tag === 'LI') {
        // Items sit on their own lines; the list around them ends the block.
        text += '\n- ';
        walk(element);
        continue;
      }
      const block = BLOCKS.has(tag);
      if (block) text += '\n\n';
      walk(element);
      if (block) text += '\n\n';
    }
  };
  walk(root);
  return tidy(text);
}

/**
 * Trims each line, keeps at most one blank line between paragraphs, and caps
 * the length at a paragraph break, saying so.
 *
 * @param {string} text
 */
export function tidy(text) {
  const clean = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (clean.length <= MAX_STORY_CHARS) return clean;
  const cut = clean.lastIndexOf('\n\n', MAX_STORY_CHARS);
  return `${clean.slice(0, cut > 0 ? cut : MAX_STORY_CHARS)}\n\n[The story goes on; this is the first part.]`;
}
