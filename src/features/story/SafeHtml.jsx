import { useLayoutEffect, useRef } from 'react';

/**
 * Shows sanitised story content (see cleanStoryHtml). The nodes are inserted
 * directly, so no HTML string is ever handed to the page.
 *
 * @param {{ fragment: DocumentFragment, className?: string }} props
 */
export default function SafeHtml({ fragment, className }) {
  const container = useRef(/** @type {HTMLDivElement|null} */ (null));
  useLayoutEffect(() => {
    container.current?.replaceChildren(fragment.cloneNode(true));
  }, [fragment]);
  return <div ref={container} className={className} />;
}
