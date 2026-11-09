# Feedolio

A fast, responsive reader for RSS and Atom feeds, with bookmarks that persist.

Feedolio is a React app (JavaScript, no CSS libraries) plus one Cloudflare Worker. The Worker fetches feeds on the app's behalf, because publishers block direct browser requests, and turns the XML into clean JSON.

> **Status:** the feed endpoint works (milestone M1). The app's views are still empty; headlines arrive in M2.

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

- **App:** React 19, React Router (data router), Redux Toolkit. Styles are CSS Modules plus design tokens in `src/styles/tokens.css`, with light and dark values copied from the design canvas.
- **Worker:** `worker/index.js` routes `/api/*`; everything else is static assets in single-page-app mode, so page navigations never run the Worker. Workers Caching is on in `wrangler.jsonc`.
- **Tests:** three Vitest projects, all against saved copies of real feeds and pages (`test/fixtures`, with their sources in its README).
  - **Journeys** (the main tool) render the real app in jsdom and fake only the network (MSW) and, when needed, the clock. Calls to `/api/feed` run the real Worker code in-process.
  - **Unit** tests cover dense logic only: parsing, normalising, main images, feed discovery and the address guard.
  - **Worker contract** tests run inside Cloudflare's runtime through `@cloudflare/vitest-plugin`.

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

```text
src/
  app/          store, router, route-level states
  features/     feeds · story · bookmarks · subscriptions · preferences · auth
  components/   AppShell, PageHeader (*.module.css)
  lib/          shared with the Worker: JSDoc types, ids, URL normalising
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
