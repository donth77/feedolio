/** Widths BBC's image service serves. It answers 404 for others, such as 1360. */
const BBC_WIDTHS = [240, 256, 480, 800, 976, 1024, 1536, 2048];

/**
 * A copy of a story image at about the size it's shown, when its host can
 * make one: Medium's CDN and BBC's image service take a width in the path, and
 * WordPress image services (The Verge, WordPress.com) take a `w` parameter.
 * Other images are returned unchanged. Feeds often point at multi-megabyte
 * originals (or, like the BBC, at 240-pixel thumbnails), so each place asks
 * for the size it needs.
 *
 * @param {string} url
 * @param {number} width  In CSS pixels × device pixel ratio
 */
export function sizedImageUrl(url, width) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.hostname.endsWith('.medium.com') && /\/max\/\d+\//.test(parsed.pathname)) {
    return url.replace(/\/max\/\d+\//, `/max/${width}/`);
  }
  if (parsed.hostname === 'ichef.bbci.co.uk' && /^\/ace\/standard\/\d+\//.test(parsed.pathname)) {
    const size = BBC_WIDTHS.find((known) => known >= width) ?? BBC_WIDTHS.at(-1);
    return url.replace(/\/ace\/standard\/\d+\//, `/ace/standard/${size}/`);
  }
  const wordpress =
    parsed.pathname.includes('/wp-content/uploads/') || parsed.hostname.endsWith('.wp.com');
  if (wordpress && !parsed.searchParams.has('w')) {
    // Appended rather than set, so the existing parameters keep their exact form.
    return `${url}${parsed.search ? '&' : '?'}w=${width}`;
  }
  return url;
}
