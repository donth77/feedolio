import { Fragment } from 'react';
import { textBlocks, textRuns } from './formatText.js';

/**
 * Model output shown as text: paragraphs, lists and emphasis, drawn with
 * React text nodes only. HTML in the output stays visible as characters and
 * never runs (§7.4).
 *
 * @param {{ text: string, className?: string }} props
 */
export default function FormattedText({ text, className }) {
  return (
    <div className={className}>
      {textBlocks(text).map((block, index) => {
        if (block.type === 'paragraph') {
          return (
            <p key={index}>
              {block.lines.map((line, at) => (
                <Fragment key={at}>
                  {at > 0 && <br />}
                  <Runs text={line} />
                </Fragment>
              ))}
            </p>
          );
        }
        if (block.type === 'heading') {
          return (
            <p key={index}>
              <strong>
                <Runs text={block.text} />
              </strong>
            </p>
          );
        }
        const items = block.items.map((item, at) => (
          <li key={at}>
            <Runs text={item} />
          </li>
        ));
        return block.type === 'bullets' ? (
          <ul key={index}>{items}</ul>
        ) : (
          <ol key={index} start={block.start === 1 ? undefined : block.start}>
            {items}
          </ol>
        );
      })}
    </div>
  );
}

/** @param {{ text: string }} props */
function Runs({ text }) {
  return textRuns(text).map((run, index) => {
    if (run.style === 'bold') return <strong key={index}>{run.text}</strong>;
    if (run.style === 'italic') return <em key={index}>{run.text}</em>;
    return <Fragment key={index}>{run.text}</Fragment>;
  });
}
