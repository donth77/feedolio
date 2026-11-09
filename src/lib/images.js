/**
 * A smaller copy of a story image, when its host can make one: Medium's CDN
 * takes a maximum width in the path, and WordPress image services (The Verge,
 * WordPress.com) take a `w` parameter. Other images are returned unchanged.
 * Feeds often point at multi-megabyte originals, so lists ask for list-sized
 * copies.
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
  const wordpress =
    parsed.pathname.includes('/wp-content/uploads/') || parsed.hostname.endsWith('.wp.com');
  if (wordpress && !parsed.searchParams.has('w')) {
    // Appended rather than set, so the existing parameters keep their exact form.
    return `${url}${parsed.search ? '&' : '?'}w=${width}`;
  }
  return url;
}
