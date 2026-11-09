# Feedolio

A fast, responsive reader for RSS and Atom feeds, with bookmarks that persist.

Feedolio is a React app (JavaScript, no CSS libraries) plus one Cloudflare Worker. The Worker fetches feeds on the app's behalf, because publishers block direct browser requests, and turns the XML into clean JSON.

> **Status:** milestone M7. Readers start with five feeds and can add any website or feed by pasting its link, then hide, remove or restore feeds in Settings. Lists show date headers and, on a return visit, a "New since your last visit" divider. Each story opens on its own page, cleaned of anything that could run code, with reading settings that are remembered. Saved stories stay readable after they leave their feed. Lists come as rows or cards, comfortable or compact; the desktop sidebar collapses to an icon rail; everything works from the keyboard, with shortcuts. Stories can be shared to X, Facebook, LinkedIn or email, copied, or sent through the phone's share sheet.

## Requirements

- Node.js 24 (see `.nvmrc`; 22.22 or later works)
- pnpm 12. `package.json` pins the exact version, so an older pnpm or Corepack switches to it automatically.

## Setup

```bash
pnpm install
pnpm dev
```

`pnpm dev` serves the app and runs the Worker in Cloudflare's local runtime, at <http://localhost:5173>. Try <http://localhost:5173/api/feed?url=https://theverge.com>: the Worker finds The Verge's feed and returns its stories as JSON. Local dev doesn't imitate Cloudflare's edge cache, so every request runs the Worker.

pnpm runs dependency install scripts only when they're approved. `pnpm-workspace.yaml` allows two: `esbuild` and `workerd`, which set up their native binaries.

## Commands

| Command              | Does                                                        |
| -------------------- | ----------------------------------------------------------- |
| `pnpm dev`           | App and Worker together, with hot reload                    |
| `pnpm test`          | All tests: journeys, unit tests and Worker contract tests   |
| `pnpm test:watch`    | Tests in watch mode                                         |
| `pnpm test:coverage` | Tests with a coverage report                                |
| `pnpm lint`          | ESLint                                                      |
| `pnpm format`        | Prettier, rewriting files (`pnpm format:check` only checks) |
| `pnpm build`         | Production build of the app and the Worker into `dist/`     |
| `pnpm preview`       | Builds, then serves the build through the Workers runtime   |
| `pnpm run deploy`    | Builds, then deploys to Cloudflare (needs `wrangler login`) |

Use `pnpm run deploy`, not `pnpm deploy`: the short form is a different, built-in pnpm command.

## How it's built

- **App:** React 19, React Router (data router), Redux Toolkit with RTK Query for feed data (retried twice on network or server errors, kept for ten minutes). Styles are CSS Modules plus design tokens in `src/styles/tokens.css`, with light and dark values copied from the design canvas.
- **Worker:** `worker/index.js` routes `/api/*`; everything else is static assets in single-page-app mode, so page navigations never run the Worker. Workers Caching is on in `wrangler.jsonc`.
- **Saved data:** the reader's own data (feeds, bookmarks, preferences, visit times) lives in `localStorage` under one versioned key, `feedolio:v1`.
  - It's checked on load: anything malformed falls back to defaults.
  - It's saved at most every 500 ms, and at once when the page is hidden or closed. Feed data is never stored.
  - Other open tabs pick up changes through the `storage` event, without a reload.
  - If the browser's storage is full, the change stays in memory and a message asks the reader to remove some saved stories. If the browser blocks storage altogether, a message says so once.
- **Tests:** three Vitest projects, all against saved copies of real feeds and pages (`test/fixtures`, with their sources in its README).
  - **Journeys** (the main tool) render the real app in jsdom and fake only the network (MSW) and, when needed, the clock. Calls to `/api/feed` run the real Worker code in-process. A test "reload" saves as a browser would, then starts a fresh app from storage.
  - **Unit** tests cover dense logic only: parsing, normalising, main images, feed discovery, the address guard, the story sanitiser and saved data.
  - **Worker contract** tests run inside Cloudflare's runtime through `@cloudflare/vitest-plugin`.

## Reading a story

A story's page is `/feeds/:feedId/stories/:storyId`, so it survives a reload and can be shared. The page finds its story in the feed data already loaded, then by fetching the feed, then in the reader's bookmarks; otherwise it explains that the story has left its feed.

Feed HTML is untrusted. It's kept raw and cleaned only when shown, by `src/features/story/cleanStoryHtml.js`, so improvements to the rules also protect older bookmarks:

- DOMPurify removes scripts, event handlers, styles, forms, SVG and anything that isn't plain content; links and images keep only http(s) addresses (and `mailto:` for links).
- Links open in a new tab with `rel="noopener noreferrer"`. Images load lazily without a referrer, and tracking pixels are dropped.
- Embedded media (iframes, video, audio, plug-ins) becomes an "Embedded media" card linking to the original story.
- A main image from the feed's media tags shows above the story only if the body doesn't start with the same picture. Headings are renumbered to follow the title without skipping levels.
- The cleaned nodes are inserted directly, never as an HTML string. DOMPurify loads with the story page, not with the lists.

Summary-only feeds (TechCrunch and BBC share a summary, not the full story) get a note and a "Continue reading on {site}" button. Full stories show a reading time at 230 words a minute. Newer and older links step through the same feed without adding to the history, so Back returns to the list.

The **Aa** button sets text size (S to XL), serif or sans, and a narrow or wide column for every story. The choice is saved on the device.

## Adding feeds

"Add feed" (in the sidebar, the top bar on phones, the first-visit welcome note and Settings) takes any link:

1. The app checks the link itself. A missing `https://` is added, so `theverge.com` works.
2. It asks `/api/feed` about the link and shows a preview: the feed's name, how often it posts, and its latest headlines.
   - If the page links to several feeds, the reader picks one, and that feed is previewed.
3. **Add feed** follows it and opens its page, already loaded from the preview.

Feeds the reader already follows are caught before and after the lookup. Addresses are compared normalised: case, a trailing slash and a fragment don't make a feed new. Failures say what went wrong and what to try.

In **Settings**:

- A switch hides a feed from All stories and Today; it stays in the sidebar.
- **Remove** offers Undo, and keeps stories saved from the feed.
- **Suggested feeds** lists starter feeds the reader removed.
- **Restore starter feeds** brings them all back.
- **Theme** switches between System, Light and Dark.

## What's new

- **The divider:** when the reader leaves the page, the time is recorded. On the next visit, a "New since your last visit" divider sits between newer and older stories, and the header counts the new ones with a "Jump to where you left off" link.
- **The welcome note:** a first visit has no divider. A welcome note explains the starter feeds and offers "Add a feed" instead.
- **Freshness:** each list says how fresh it is ("Updated 4 min ago"), and **Refresh** fetches every feed again.

## Reading your way

- **Layout:** List or Cards, and Comfortable or Compact density, from the list header or Settings. Both are remembered.
- **Sidebar:** from 1024 px, the sidebar collapses to a 64 px icon rail with the button at its top or the `[` key. Without a choice from the reader, it's expanded from 1280 px and a rail below that; once they choose, their choice is remembered. Rail icons keep accessible names and tooltips, with count badges.
- **Theme:** System, Light or Dark. A few lines in `index.html` apply a chosen theme before the first paint, so a dark page never flashes white.

### Keyboard

Everything works with the keyboard. A skip link leads past the navigation, and coming back from a story puts focus on it again.

| Key              | Does                                                     |
| ---------------- | -------------------------------------------------------- |
| J / K            | Next or previous story (on a story page: older or newer) |
| Enter or O       | Open the selected story                                  |
| V                | Open the original on the publisher's site                |
| S                | Save or unsave                                           |
| R                | Refresh feeds                                            |
| `[`              | Collapse or expand the sidebar                           |
| G then T, A or S | Go to Today, All stories or Saved                        |
| ?                | Show every shortcut                                      |
| Esc              | Close a dialog or menu                                   |

"Selected" is simply the story whose headline has focus, so J and K move focus, and Tab works too. Shortcuts pause while typing in a field or while a dialog is open.

## Sharing

Every story page ends with "Share this story":

- **Networks:** Post on X, Facebook, LinkedIn. Each is a plain link to that network's share page, opening in a new tab. No network's buttons, scripts or trackers are loaded.
- **Email:** a `mailto:` link with the title as the subject.
- **Copy link:** copies the link and confirms with "Copied".

Shares always use the publisher's original link, so anyone can read it without Feedolio.

The **Share** button at the top opens the device's share sheet where there is one (most phones). Elsewhere it copies the link and says so.

## Saving stories

The bookmark button on every headline and story page saves the story. It's a toggle (`aria-pressed`), so the same button un-saves it, with an Undo message.

A bookmark keeps a full copy of the story. Feeds keep only their latest stories, so this is what lets a saved story open after it drops out of its feed, or after its feed is removed.

The Saved page lists bookmarks most recently saved first, and the sidebar shows how many there are. A long-form story copy is about 15 KB, so roughly 300 fit in the browser's usual 5 MB.

## The feed endpoint

`GET /api/feed?url=<feed or website address>`

- **A feed address** returns `{ feed, stories, fetchedAt }`. RSS 2.0, RSS 1.0 and Atom all come out as the same `Story` shape (see `src/lib/types.js`), with a main image picked from media tags, an image enclosure or the first real image in the body.
- **A website address** is searched for `<link rel="alternate">` feed links. One feed is fetched and returned; several return `{ choices: [{ title, url }] }`; none is `NO_FEED_FOUND`.
- **Safety:** only http(s) on ports 80 and 443; `localhost` and private, loopback, link-local and reserved IP addresses are refused, on every redirect too (three at most). Each request gets 8 seconds in total, and feeds over 5 MB are refused.
- **Caching:** successful answers carry `Cloudflare-CDN-Cache-Control: max-age=600, stale-while-revalidate=3600, stale-if-error=86400` and `Cache-Control: no-cache`. Errors are never cached.

| Error code         | Status | When                                                                      |
| ------------------ | ------ | ------------------------------------------------------------------------- |
| `INVALID_URL`      | 400    | Not an absolute http(s) address                                           |
| `BLOCKED_HOST`     | 400    | `localhost`, a private or reserved IP, or a port other than 80/443        |
| `NOT_A_FEED`       | 422    | Neither a feed nor a web page, e.g. JSON or an image                      |
| `NO_FEED_FOUND`    | 422    | A web page with no feed link                                              |
| `UPSTREAM_ERROR`   | 502    | The site answered with an error (`upstreamStatus`) or couldn't be reached |
| `TOO_LARGE`        | 502    | A feed over 5 MB                                                          |
| `UPSTREAM_TIMEOUT` | 504    | No complete answer within 8 seconds                                       |

Errors look like `{ "error": { "code": "NO_FEED_FOUND", "message": "…" } }`.

## Project layout

```text
src/
  app/          store, router, saved data (persistence.js), visits, route-level states
  features/     feeds · story · bookmarks · subscriptions · preferences · auth
  components/   AppShell, NavPanel, Drawer, StoryList, StoryRow, StoryImage, Monogram, Icon
  lib/          dates, images, feed tiles; shared with the Worker: JSDoc types, ids,
                URL normalising, tracking-pixel rules
  styles/       tokens.css, base.css
worker/
  index.js      routes /api/*
  lib/          handleFeedRequest, safeFetch, urlGuard, parser, normaliseFeed,
                pickMainImage, discoverFeed, text
test/           journeys/, unit/, worker/, fixtures/, msw/, support/, setup/
```

## Deploying

Deploys use Cloudflare Workers Builds, connected to the GitHub repository:

1. `pnpm exec wrangler login` once, then `pnpm run deploy` for a first manual deploy.
2. In the Cloudflare dashboard, connect the repository to the `feedolio` Worker (Workers Builds). Use build command `pnpm build`, deploy command `pnpm exec wrangler deploy`, and non-production branch command `pnpm exec wrangler versions upload`, which gives each branch a preview URL.

CI (`.github/workflows/ci.yml`) runs lint, the format check, tests with coverage and the build on every push.
