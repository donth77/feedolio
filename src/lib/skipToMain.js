/**
 * Moves focus past the navigation to the page's content, without changing the
 * address.
 *
 * @param {import('react').MouseEvent<HTMLAnchorElement>} event
 */
export function skipToMain(event) {
  const main = document.getElementById('main');
  if (!main) return;
  event.preventDefault();
  main.focus();
}
