/**
 * Share pages for a story, built from its original link and title. They're
 * plain links: no share buttons, scripts or tracking from the networks.
 *
 * @param {{ title: string, url: string }} story  url: the publisher's page
 */
export function shareLinks({ title, url }) {
  const query = (/** @type {Record<string, string>} */ params) =>
    new URLSearchParams(params).toString();
  return {
    x: `https://x.com/intent/post?${query({ text: title, url })}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?${query({ u: url })}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?${query({ url })}`,
    // mailto wants %20 for spaces, not the + that URLSearchParams writes.
    email: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${title}\n\n${url}`)}`,
  };
}

/**
 * Copies text to the clipboard. Resolves false when the browser won't allow it.
 *
 * @param {string} text
 */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
