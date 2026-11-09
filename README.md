# Feedolio

A fast, responsive reader for RSS and Atom feeds, with bookmarks that persist.

Feedolio is a React app (JavaScript, no CSS libraries) plus one Cloudflare Worker. The Worker fetches feeds on the app's behalf, because publishers block direct browser requests, and turns the XML into clean JSON.

> **Status:** milestones M0 to M12 are built. Readers start with five feeds and can add any website or feed by pasting its link. Stories open on their own pages, cleaned of anything that could run code. Saved stories stay readable after they leave their feed. Lists come as rows or cards, the sidebar collapses to an icon rail, everything works from the keyboard, and stories can be shared without trackers. Readers can sign in with GitHub to keep their data apart on a shared browser, and can connect their own AI provider to summarize, translate or explain any story, and to hide, highlight or tag stories with plain-English rules. A "Catch me up" digest (M13) comes next.
>
> **Live:** set this line after the first production deploy (see [Deploying](#deploying)).

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
| `pnpm test:smoke`    | Playwright smoke tests against `SMOKE_URL` (see Testing)    |
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

## Signing in

Sign-in is optional, and Feedolio works fully without it. Signing in with GitHub (through Auth0) keeps each reader's feeds and saved stories apart on a shared browser. Nothing syncs between devices.

- **Separate data:** each account's data is saved under its own key, `feedolio:v1:<user id>`. Signed-out reading uses `feedolio:v1`, and signing out keeps an account's data for next time.
- **Guest stories:** on an account's first sign-in in a browser, Feedolio offers to bring over the stories saved there while signed out.
- **What's stored:** `feedolio:session` holds only who is signed in (id, name, picture), never a token. Auth0's tokens stay in memory, and Feedolio calls no API with them.
- **Code loading:** the Auth0 SDK (about 62 KB) loads only to sign in or out. Readers who never sign in never download it.

To turn it on:

1. In Auth0, create a **Single Page Application** and enable the **GitHub** social connection for it.
2. Add `http://localhost:5173` and each deployed address (including `workers.dev` and preview URLs) to its Allowed Callback URLs, Allowed Logout URLs and Allowed Web Origins.
3. Set `VITE_AUTH0_DOMAIN` and `VITE_AUTH0_CLIENT_ID` (see `.env.example`): in `.env` for local development, and as build variables in Workers Builds. Both are public values.

Without them, sign-in is hidden. If you use an Auth0 custom domain, add it to `connect-src` in `public/_headers`.

## AI, with your own key

AI is optional and stays off until a reader sets it up in **Settings › AI** (`/settings/ai`). Feedolio has no AI backend: the browser calls the reader's chosen provider directly, with the reader's own key, and the reader's provider bills them.

| Role                                | Providers                                                                                       | Does                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **General model** (required for AI) | Anthropic, OpenAI, OpenRouter, Ollama on the reader's computer, or any OpenAI-compatible server | Summaries, translations, explanations, the digest            |
| **Decision model** (optional)       | TypeSafe Jev, through OpenRouter or TypeSafe's API                                              | Yes/no rule matching and ranking, with calibrated confidence |

- **Connecting:** pick a provider, paste a key and press **Test connection**. Feedolio lists the provider's models (free) and shows "Connected · 14 models · 320 ms". Anthropic opens on `claude-opus-5-5`; readers can pick any model their key lists. A saved connection is checked again when Settings › AI opens.
- **Plain-words errors:** a rejected key, a server that can't be reached, a bad address, or a provider turning a request down each get their own message. Anything a provider says is scrubbed of the key before it's shown.
- **Ollama:** it must allow Feedolio's address. Start it with `OLLAMA_ORIGINS` set to the site's address (for example `OLLAMA_ORIGINS=https://feedolio.example.workers.dev ollama serve`), then test again. Some browsers ask before a website can reach a local server.
- **Jev:** TypeSafe's own API only accepts requests from TypeSafe's console (checked 2026-11-09), so browsers can't reach it from Feedolio. OpenRouter serves the same API and does accept them, so "TypeSafe Jev · OpenRouter" is the route that works today. Without a decision model, the general model does the judging, with a wider "Maybe" band.
- **Where keys live:** in `localStorage["feedolio:ai-keys:v1"]`, apart from all other data (never in `feedolio:v1`). With **Remember on this device** off they move to `sessionStorage` and go when the tab closes. Signed-in readers have their own (`…:<user id>`). Keys are never logged and never sent to `/api/feed`.
- **Remove all keys** deletes every Feedolio AI key in the browser, for every account, and turns AI off. Settings stay, so AI works again after connecting.
- **Which model does what:** writing goes to the general model; yes/no and scoring go to the decision model when there is one. Settings shows the table.
- **Usage:** Settings › AI counts this session's requests and approximate tokens sent. Only stories the reader uses AI on, or that rules check, are sent.
- **Anthropic details:** the official SDK runs in browser mode (`dangerouslyAllowBrowser`, safe because the key is the reader's own), pinned to `api.anthropic.com`. Answers stream at low effort; JSON uses structured output; a refusal is retried on Anthropic's recommended model (`fallbacks: "default"`).
- **Code loading:** none of this is on the first page. Settings › AI is about 8 KB, and the Anthropic SDK (about 78 KB) loads only when an Anthropic model is used.
- **Caching:** answers are kept in IndexedDB (`feedolio-ai`) for 30 days, per account, story, action, language and model, so the same question is never paid for twice.

### On a story

With AI set up, a story page shows **Summarize**, **Translate** (with a language menu; Settings › AI picks the first choice) and **Explain** under the byline (US-100 to US-103).

- **Streaming:** the answer appears in a panel as it's written, labelled with the model that wrote it and whose key paid ("claude-opus-5-5 · your Anthropic key"), with the note "AI can make mistakes. Check the original." Stop ends it part-way.
- **Copy, Regenerate, Close:** Copy takes the answer as plain text; Regenerate asks again even when an answer is kept; Close returns focus to the button.
- **Summary-only feeds:** the actions work on the feed's summary and say so, and the prompt tells the model not to guess at the rest.
- **Text only:** answers are drawn as paragraphs and simple lists by Feedolio's own formatter. HTML in an answer shows as characters and never runs, and answers carry no links.
- **What's sent:** the story's title and text (or summary), fenced and labelled as untrusted, at low effort. Nothing is sent until the reader presses a button.
- **Off switch:** Settings › AI can turn article actions off. If a key kept for one tab is gone, the buttons point back to Settings.
- **Code loading:** the actions (about 5 KB) load only for readers who set up AI.

### Filter rules

Readers write rules in plain English in **Settings › Rules** (`/settings/rules`), such as "Hide event announcements and conference promotions", and pick what happens: **Hide**, **Highlight** or **Tag as…** (US-104 to US-108).

- **Test on recent stories** shows what a rule would catch, with each verdict and its confidence, before saving.
- **Checking:** new stories are checked a moment after they load, in batches of up to 25, once per story and rule version, and never again on refresh. Editing a rule checks stories again. Judgments live in IndexedDB.
- **Who judges:** Jev when there's a decision model, otherwise the general model (with structured output).
- **Confidence bands:** with Jev, 75% or more applies the rule, 40–75% goes to **Maybe**, and less is ignored. A general model's confidence is self-reported, so its bands are wider: 85%+ applies, 30–85% is Maybe.
- **Maybe** (`/maybe`): the reader answers "Yes" or "Not a match", with Undo. The answer is remembered and wins over the model.
- **Hidden** (`/hidden`): hidden stories leave the lists ("3 stories hidden by your rules · View hidden") and wait here with the reason, until the reader unhides them. Nothing is ever deleted: hidden stories stay even if their rule is switched off, edited or removed, and a copy of each story is kept so it outlives its feed.
- **Highlights and tags:** highlighted stories get a light accent and "Highlighted · New AI devices"; tags appear as chips and get their own page (`/tags/:tag`). The sidebar gains **AI** (Maybe, Hidden) and **Tags** groups, the collapsed rail shows Maybe and Hidden, and phones show them as chips.
- **When something goes wrong,** All stories says so under the list ("Rules couldn’t check new stories. …") and checking resumes with the next new stories.
- **Code loading:** the rules pages and the checker load only for readers with rules; on the first page, rules cost about 2 KB.

## Security

- **Feed content is untrusted.** Story HTML is cleaned by DOMPurify plus Feedolio's own rules when it's shown (see [Reading a story](#reading-a-story)). Titles and excerpts are always text.
- **The feed endpoint is not an open proxy.** It only fetches http(s) on standard ports and refuses local, private and reserved addresses on every redirect, with time and size limits.
- **Headers:** `public/_headers` gives every page a strict Content Security Policy:
  - Scripts come only from Feedolio's own files, plus the inline theme script by its hash. A unit test checks the hash still matches `index.html`.
  - No inline styles, plug-ins, frames, or `<base>`; fonts are self-hosted.
  - Trusted Types are required, so no HTML string can reach the page except through DOMPurify's policy.
  - Pages also get `nosniff`, `X-Frame-Options: DENY`, a strict referrer policy and a locked-down permissions policy.
- **No third-party scripts:** no analytics, no social widgets, no fonts from other sites.
- **AI keys:** `connect-src` allows any https address and `localhost`, because readers choose their own AI providers (and Ollama runs locally). So the policy can't stop data leaving; keeping script injection out is what protects keys. Model output is only ever shown as text through Feedolio's own formatter, and feed text is fenced and labelled as untrusted in every prompt.

## Testing

Journey tests are the main tool: they check what a reader sees and does, not how the code is arranged. Three Vitest projects run against saved copies of real feeds and pages (`test/fixtures`, with their sources in its README):

- **Journeys** (`test/journeys`) render the real app in jsdom and fake only the network (MSW) and, when needed, the clock. Calls to `/api/feed` run the real Worker code in-process. A test "reload" saves as a browser would, then starts a fresh app from storage. Each view is also checked with axe.
- **Unit** tests (`test/unit`) cover dense logic only: parsing, normalising, main images, feed discovery, the address guard, the story sanitiser, saved data, adding feeds, share links, the security headers, and the AI adapters, router, key store, cache and text formatter.
- **Worker contract** tests (`test/worker`) run inside Cloudflare's runtime through `@cloudflare/vitest-plugin`.
- **AI providers** answer with responses recorded from Anthropic and TypeSafe, or written to OpenAI's documented format (`test/fixtures/ai`). Every journey test also checks every request it makes: a test key sent anywhere but its own provider fails the test.

Coverage targets are 90% of lines and branches for the Worker and dense logic, and 80% of lines for the app. `scripts/coverage.mjs` measures each project separately.

**Smoke tests** (`e2e/`, Playwright) use real browsers and real feeds against a deployed copy, at desktop and phone sizes:

```bash
SMOKE_URL=https://<version>-feedolio.<account>.workers.dev pnpm test:smoke
```

They need a browser: run `pnpm exec playwright install chromium` once, or set `PW_CHANNEL=msedge` or `PW_CHANNEL=chrome` to use one already installed. On GitHub, run the **Smoke test** workflow from the Actions tab with the address to test. Locally, `pnpm preview` serves the production build (on port 4173) to point them at.

## Decisions and trade-offs

| Decision                                                 | Why                                                                                                                  | Trade-off                                                                                                      |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| A small Cloudflare Worker fetches feeds                  | Publishers don't allow browsers to read their feeds directly (CORS), and parsing XML on a server keeps the app light | One server-side piece to run; its URL checks keep it from becoming an open proxy                               |
| Cloudflare's edge caches feed answers for 10 minutes     | Keeps the Worker within the free plan and makes repeat loads instant                                                 | A story can appear up to 10 minutes late; the list says how fresh it is                                        |
| Feed HTML is cleaned in the browser, when shown          | One place to audit, and better rules protect old bookmarks too                                                       | About 17 KB more on the story page, loaded only there                                                          |
| Saved data lives in `localStorage`                       | Synchronous, tiny and easy to test; nothing to sign up for                                                           | Per device and about 5 MB; a warning appears if it fills up                                                    |
| Bookmarks keep a full copy of the story                  | Feeds keep only their latest items, so saved stories would otherwise disappear                                       | Uses more storage than a link would                                                                            |
| Redux Toolkit with RTK Query                             | Feed data gets caching, retries and loading states without hand-written code; reader data stays in plain slices      | More moving parts than React state alone                                                                       |
| JavaScript with JSDoc, CSS Modules and design tokens     | As the brief asks: no TypeScript, no CSS libraries                                                                   | Types are documented, not compiled                                                                             |
| A "new since your last visit" divider, not unread counts | Shows where the reader left off without tracking every story                                                         | Doesn't remember individual stories read                                                                       |
| AI runs in the browser on the reader's own keys          | No AI backend and no AI cost to us; any provider, including local models                                             | Providers must allow browser requests; keys share the page with feed content, so injection defences are strict |

## What's next

- **AI Catch me up (M13), optional:** a digest of what the reader missed, grouped into stories, ranked and summarised, on the connection set up in Settings › AI.
- **Later:** sync across devices, search, OPML import, offline reading, and rate limiting on the feed endpoint.

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
  features/     feeds · story · bookmarks · subscriptions · preferences · share ·
                shortcuts · auth (GitHub sign-in through Auth0) ·
                ai (Settings › AI, provider adapters, task router, key store, cache)
  components/   AppShell, NavPanel, Drawer, StoryList, StoryRow, StoryCard, StoryImage,
                Monogram, Toast, Segmented, Icon
  lib/          dates, images, feed tiles; shared with the Worker: JSDoc types, ids,
                URL normalising, tracking-pixel rules
  styles/       tokens.css, base.css
worker/
  index.js      routes /api/*
  lib/          handleFeedRequest, safeFetch, urlGuard, parser, normaliseFeed,
                pickMainImage, discoverFeed, text
test/           journeys/, unit/, worker/, fixtures/, msw/, support/, setup/
e2e/            Playwright smoke tests against a deployed copy
public/_headers security headers for the app's pages
```

## Deploying

Deploys use Cloudflare Workers Builds, connected to the GitHub repository:

1. `pnpm exec wrangler login` once, then `pnpm run deploy` for a first manual deploy. Wrangler prints the `workers.dev` address.
2. In the Cloudflare dashboard, connect the repository to the `feedolio` Worker (Workers Builds):
   - build command: `pnpm build`
   - deploy command: `pnpm exec wrangler deploy`
   - non-production branch command: `pnpm exec wrangler versions upload`, which gives each branch a preview URL.
3. Run the smoke tests against the preview or live address (see [Testing](#testing)).

No secrets are needed. GitHub sign-in needs the two public Auth0 values above as build variables. CI (`.github/workflows/ci.yml`) runs lint, the format check, tests with coverage and the build on every push.
