import { useState } from 'react';
import { MonogramTile } from './Monogram.jsx';

/**
 * A story's main image, filling a box whose size is already reserved. Loads
 * lazily and without a referrer; falls back to the feed's monogram tile when
 * there's no image or it fails to load.
 *
 * @param {{ src: string|null, feed: import('./Monogram.jsx').FeedMark, className?: string }} props
 */
export default function StoryImage({ src, feed, className = '' }) {
  const [failedSrc, setFailedSrc] = useState(/** @type {string|null} */ (null));

  if (!src || failedSrc === src) return <MonogramTile feed={feed} className={className} />;
  return (
    <img
      className={className}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
    />
  );
}
