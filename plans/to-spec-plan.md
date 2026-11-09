# Spec: Feedolio — a simple RSS reader

> **At a glance**
> - **What:** a responsive React (JavaScript) web app for reading RSS and Atom feeds, with bookmarks that persist and optional AI help on the reader's own keys.
> - **Hosting:** one Cloudflare Worker. It serves the app's static files and a small feed endpoint (`/api/feed`) that the browser needs because publishers block cross-site requests. AI requests never touch it: they go straight from the browser to the reader's chosen provider.
> - **Scope:** the app (US-01 to US-94, and US-115), plus AI stretch features (US-95 to US-114).
> - **Status:** ready for implementation. Test seams confirmed 2026-11-09. Triage label `ready-for-agent`.
>
> Written with Matt Pocock's [`to-spec`](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-spec/SKILL.md) skill, which synthesises a spec from what's already known, without an interview. Sources: the "Simple RSS Reader" brief (`docs/` PDF), a live inspection of the sample feeds on 2026-11-06, and research into Feedly, Inoreader, NetNewsWire, Reeder, Feedbin and Readwise Reader on 2026-11-09.

---

## Problem Statement

I follow a handful of publications, and keeping up means visiting each site separately, through its own clutter and pop-ups. When I find a story I want to come back to, I have nowhere reliable to keep it. Browser tabs pile up and get closed by accident.

RSS feeds already publish every story in a structured way. But a raw feed is unreadable XML in a browser, and most feed readers feel heavy, demand an account up front, or work badly on a phone.

**I want a simple web app that:**

- shows headlines from several feeds in one place,
- opens a story on its own clean page with everything the feed provides,
- lets me save stories and keeps them saved when I come back days later,
- shows me what's new since I last looked,
- lets me add a site by pasting the address I already have,
- works well on my phone, tablet and laptop.

If I choose to bring my own AI key, I'd also like help with long or foreign-language stories, a way to filter out what I don't care about, and a quick catch-up after a few days away. My key should go to no one except the provider I picked.

## Solution

**Feedolio** is a lightweight, responsive web app for reading RSS and Atom feeds.

| Area | What the reader gets |
|---|---|
| **Start reading at once** | Sensible default feeds, merged into one **All stories** list, newest first. Each row shows the headline, source, author, time, a short excerpt and the story's main image, or a tidy tile with the publication's initial when there's no image. |
| **Switch feeds** | One click or tap. A sidebar on laptops; feed chips and a bottom tab bar (Stories · Saved · Settings) on phones. Every view has its own URL. |
| **Read a story** | Its own page with everything the feed provides: title, byline, date, categories, image and the full formatted body, in a comfortable reading layout. Summary-only feeds (such as TechCrunch) say so clearly and link prominently to the full article. |
| **Save stories** | A bookmark toggle on every story (filled icon plus a "Saved" label when saved). Saved stories live on a **Saved** page, persist across sessions, and stay readable after they leave the publisher's feed. |
| **Share** | X, Facebook, LinkedIn, email or copy link. Phones use the native share sheet. No third-party tracking scripts. |
| **See what's new** | A **Today** view, date headers (Today, Yesterday, Earlier this week, Older), and a "New since your last visit" divider on return visits. |
| **Read your way** | List or Cards layout, Comfortable or Compact density, keyboard shortcuts (`?` lists them all), and reading settings on the story page: text size, serif or sans, line width. |
| **Manage feeds** | Add a feed by pasting any website or feed link: Feedolio finds the feed and previews its latest headlines and how often it posts. Hide a feed from All stories, remove it, or restore the starters. A welcome note on the first visit explains the starter feeds. Choose light, dark or system theme. |
| **Sign in** | GitHub sign-in. It's optional for readers: everything works without an account. |
| **AI help (optional, stretch)** | Bring your own key. **Summarize, Translate and Explain** on any story. Plain-English **filter rules** that hide, highlight or tag new stories, with unsure matches in a **Maybe** view and nothing ever deleted. A **Catch me up** digest that groups what's new into a few stories with links to the sources. Keys stay in the browser, and requests go straight to the reader's chosen provider. |

## User Stories

Stories are numbered **US-01 to US-115**. US-82 to US-94 come from research into popular readers, US-95 to US-114 are the AI stretch features, and US-115 (a collapsible sidebar) was added last. Implementation, test and slice notes below refer to these IDs.

### Browsing headlines

| ID | As a… | I want… | So that… |
|---|---|---|---|
| US-01 | reader | a list of story headlines as soon as I open the app | I can scan what's new at a glance |
| US-02 | reader | each headline to show its source, author and publish time | I can judge relevance and freshness before opening it |
| US-03 | reader | a short plain-text excerpt under each headline | I can decide whether a story is worth opening |
| US-04 | reader | relative times for recent stories ("3h ago", "Yesterday") and dates for older ones | time is quick to read either way |
| US-05 | reader | stories sorted newest first | the latest news is at the top |
| US-06 | reader | an "All stories" view that merges all my feeds | I don't have to check each feed separately |
| US-07 | reader | to open a single feed's stories | I can focus on one publication |
| US-08 | reader | to switch feeds with one click or tap | moving between publications feels instant |
| US-09 | reader | the current feed reflected in the address bar | refreshing or bookmarking the page keeps me in the same view |
| US-10 | reader | a skeleton placeholder while a feed loads | I know the app is working and the layout doesn't jump |
| US-11 | reader | a clear message and a Retry button when a feed fails | a broken feed doesn't leave me stuck |
| US-12 | reader | other feeds in "All stories" to keep showing when one fails | one outage doesn't block my reading |
| US-13 | reader | a Refresh control and a "last updated" time | I can check for new stories and know how fresh the list is |
| US-14 | reader | feeds I loaded a moment ago to appear instantly when I go back to them | the app feels fast |
| US-15 | reader | my scroll position restored when I return from a story | I don't lose my place |

### Main image (bonus)

| ID | As a… | I want… | So that… |
|---|---|---|---|
| US-16 | reader | each headline to show the story's main image | the list is easier and more pleasant to scan |
| US-17 | reader | stories without an image to show a consistent tile with the publication's initial | the list stays tidy and recognisable |
| US-18 | reader | tracking pixels, tiny icons and decorative images never picked as the main image | thumbnails are always meaningful |
| US-19 | reader on a slow connection | list images to load lazily, with their space reserved | headlines appear quickly and the page doesn't shift |
| US-20 | reader | a broken image to fall back to the placeholder tile | the list never shows broken-image icons |

### Story page

| ID | As a… | I want… | So that… |
|---|---|---|---|
| US-21 | reader | clicking a headline to open the story on its own page | I can read without distractions |
| US-22 | reader | the page to show everything the feed provides (title, author, date, categories, main image, full body) | I can read without leaving the app when the feed allows it |
| US-23 | reader | the body to keep its formatting (paragraphs, headings, lists, quotes, figures with captions, links) | it reads like the original |
| US-24 | reader | links inside a story to open in a new tab | I don't lose my place in the app |
| US-25 | reader | a "Read the original" link to the publisher's page | I can see the original layout and support the publisher |
| US-26 | reader of a summary-only feed | the page to show the summary, say the full article is on the publisher's site, and offer a prominent button to it | a short page doesn't look like a bug |
| US-27 | reader | each story page to have its own URL that still works after a refresh | reloading never loses the story |
| US-28 | reader | a helpful message and a link to the original when a story is no longer in its feed | an old link doesn't strand me |
| US-29 | reader | a comfortable reading layout (limited line length, generous type, good contrast) | long stories are pleasant on any screen |
| US-30 | reader | an estimated reading time on full-content stories | I know what I'm committing to |
| US-31 | reader | a one-click way back to the list I came from | browsing many stories is quick |
| US-32 | reader | "previous" and "next" story links | I can read through a feed in order |
| US-33 | reader | the hero image not to appear twice when the body already starts with it | the page looks intentional |
| US-34 | security-conscious reader | scripts, event handlers and unsafe links stripped from feed content | a malicious feed can't run code in my browser |
| US-35 | reader | embedded media the app can't safely show to become a clear "View on the original site" link | I know something is missing and where to find it |

### Bookmarks

| ID | As a… | I want… | So that… |
|---|---|---|---|
| US-36 | reader | to bookmark a story from the headline list | I can save it without opening it |
| US-37 | reader | to bookmark a story from its story page | I can save what I'm reading |
| US-38 | reader | saved and unsaved states to look clearly different (filled vs outline icon, plus a "Saved" label) | I always know whether a story is saved |
| US-39 | reader | to un-bookmark with the same control | saving is easy to reverse |
| US-40 | reader | a brief confirmation with Undo after un-bookmarking | an accidental tap doesn't lose a story |
| US-41 | reader | a Saved page listing every bookmark, most recently saved first | I can find them later |
| US-42 | reader | bookmarks to survive closing the tab, restarting the browser, or days away | saving is trustworthy |
| US-43 | reader | a saved story to stay readable after it drops out of the publisher's feed | saved stories never disappear |
| US-44 | reader | stories saved from a feed to stay saved after I remove that feed | cleaning up feeds doesn't delete my reading list |
| US-45 | reader | the saved count visible in the navigation | I know my reading list is there |
| US-46 | reader | a friendly empty state on the Saved page that explains how to save | the feature is discoverable |
| US-47 | reader with the app open in two tabs | a bookmark made in one tab to show in the other | the app never shows conflicting states |
| US-48 | reader | a clear warning if my browser refuses to store more bookmarks | I'm never silently losing saves |

### Sharing (bonus)

| ID | As a… | I want… | So that… |
|---|---|---|---|
| US-49 | reader | buttons to share a story on X, Facebook and LinkedIn | I can pass it on |
| US-50 | reader | to email a story link with the title pre-filled | I can send it to someone who isn't on social media |
| US-51 | reader | to copy a story's link, with a visible "Copied" confirmation | I can paste it anywhere |
| US-52 | mobile reader | one Share button that opens my device's share sheet | I can share to any app I use |
| US-53 | privacy-conscious reader | sharing that loads no third-party scripts or trackers | reading in the app isn't tracked by social networks |
| US-54 | reader | shared links to point to the publisher's original article | people I share with can read it without this app |

### Settings and feed management (bonus)

| ID | As a… | I want… | So that… |
|---|---|---|---|
| US-55 | new reader | sensible default feeds on my first visit | the app is useful immediately |
| US-56 | reader | to see all my subscribed feeds in Settings | I know what I'm following |
| US-57 | reader | to add a feed by pasting its URL | I can follow sources beyond the defaults |
| US-58 | reader | the app to confirm a URL is a working RSS or Atom feed, and show its title, before adding it | I don't add broken feeds |
| US-59 | reader | a specific error when a URL isn't a feed or can't be reached | I know what to fix |
| US-60 | reader | to be stopped from adding a feed I already follow | my list doesn't fill with duplicates |
| US-61 | reader | to hide a feed from "All stories" without deleting it | I can quiet a noisy source but still open it directly |
| US-62 | reader | to remove a feed I no longer want | my list stays relevant |
| US-63 | reader | to restore the default feeds | I can recover from removing too much |
| US-64 | reader | my feed list and settings to persist across sessions | I set things up once |
| US-65 | reader | to choose light, dark or system theme | reading is comfortable day and night |

### Responsive and accessible

| ID | As a… | I want… | So that… |
|---|---|---|---|
| US-66 | mobile reader | a single-column layout with a bottom tab bar and large tap targets | the app is easy to use with one thumb |
| US-67 | tablet reader | the feed list in a slide-out drawer | content gets the space in either orientation |
| US-68 | desktop reader | a persistent sidebar listing my feeds | switching is always one click away |
| US-69 | keyboard user | every control reachable and usable by keyboard, with a clear focus ring | I don't need a mouse |
| US-70 | screen-reader user | bookmark buttons that announce whether they're pressed, plus proper landmarks and headings | I can navigate efficiently |
| US-71 | reader who prefers less motion | animations reduced when my system asks for it | the app is comfortable to use |
| US-72 | reader with low vision | WCAG AA contrast and a layout that survives 200% zoom | I can read comfortably |

### Account (OAuth)

| ID | As a… | I want… | So that… |
|---|---|---|---|
| US-73 | reader | to use the whole app without signing in | there's no barrier to reading |
| US-74 | reader | to sign in with GitHub | my saved stories and feeds are tied to my account on this device |
| US-75 | reader sharing a computer | each signed-in account to see only its own bookmarks and feeds | people don't mix up their reading lists |
| US-76 | signed-in reader | to sign out | the next person on the device doesn't see my data |

### Maintainers and reviewers

| ID | As a… | I want… | So that… |
|---|---|---|---|
| US-77 | developer | automated tests that exercise real reader journeys | I can change the code with confidence |
| US-78 | developer | feed handling tested against saved copies of real feeds | publisher quirks don't regress silently |
| US-79 | developer | one command (`npm run dev`) to run the whole app, feed endpoint included | setup takes minutes |
| US-80 | reviewer | a deployed URL | I can try the app without installing anything |
| US-81 | reviewer | a README covering how to run, test and deploy, plus the decisions and trade-offs | I can evaluate the work quickly |

### What's new (from reader research)

| ID | As a… | I want… | So that… |
|---|---|---|---|
| US-82 | returning reader | a Today view with every story from the last 24 hours across my feeds | I can catch up on the day in one place |
| US-83 | reader | stories grouped under date headers: Today, Yesterday, Earlier this week, Older | I can see at a glance how fresh they are |
| US-84 | returning reader | a "New since your last visit" divider between new and older stories | I know where I left off, without tracking every story I've read |

### Read your way (from reader research)

| ID | As a… | I want… | So that… |
|---|---|---|---|
| US-85 | reader | to switch between a List layout and an image-first Cards layout | I can scan the way I like |
| US-86 | reader | Comfortable or Compact density | I can fit more stories on screen or give them more room |
| US-87 | keyboard user | shortcuts to move between stories, open one, save it, open the original and refresh | I can read quickly without a mouse |
| US-88 | keyboard user | to press `?` and see every shortcut | I can learn them without leaving the page |
| US-89 | reader | reading settings on the story page: text size, serif or sans, and line width | long stories are comfortable for my eyes |
| US-115 | desktop reader | to collapse the sidebar to a slim icon rail, and expand it again with a button or the `[` key | stories get more room on a smaller laptop screen |

### Adding feeds and the first visit (from reader research)

| ID | As a… | I want… | So that… |
|---|---|---|---|
| US-90 | reader | to add a feed by pasting the website's address, not just its feed address | I don't have to hunt for feed links |
| US-91 | reader | to choose which feed to follow when a page offers several | I follow the section I actually want |
| US-92 | reader | the preview to show the feed's latest headlines and about how many posts it publishes a week | I know what I'm signing up for |
| US-93 | new reader | a welcome note that explains the starter feeds and how to add my own | I understand where my stories come from |
| US-94 | reader | suggested feeds in Settings, including starter feeds I removed | I can bring a feed back in one tap |

### AI setup (stretch)

| ID | As a… | I want… | So that… |
|---|---|---|---|
| US-95 | reader who wants AI help | to connect a general model with my own key: any OpenAI-compatible endpoint (including OpenRouter and Ollama on my computer) or Anthropic | I choose the provider and pay only for what I use |
| US-96 | reader who wants AI help | to add an optional decision-model key, such as TypeSafe Jev, for yes/no questions and scoring | filtering and ranking are cheaper and come with calibrated confidence |
| US-97 | privacy-conscious reader | my keys to stay in my browser and never go to Feedolio's servers, with the choice not to remember them after I close the tab | my keys stay under my control |
| US-98 | reader setting up AI | a Test connection button with clear errors, including how to let Ollama accept requests from Feedolio | I can fix setup problems myself |
| US-99 | reader | to remove all my keys in one step | I can stop using AI at any time |

### AI article actions (stretch)

| ID | As a… | I want… | So that… |
|---|---|---|---|
| US-100 | reader | a Summarize button on a story | I get the gist before committing to a long read |
| US-101 | reader | to translate a story into my language | I can read sources in other languages |
| US-102 | reader | an Explain button for context and unfamiliar terms | I can follow stories outside my field |
| US-103 | reader | to see which model produced AI text, with a reminder that AI can make mistakes | I know how far to trust it |

### AI filter rules (stretch)

| ID | As a… | I want… | So that… |
|---|---|---|---|
| US-104 | reader | to write a filter rule in plain English | I can shape my feeds without learning a query language |
| US-105 | reader | rules that hide, highlight or tag matching stories | noise fades and what matters stands out |
| US-106 | reader | to test a rule on recent stories before saving it | I can see what it would catch |
| US-107 | reader | uncertain matches to go to a Maybe view where I decide, and my answer to be remembered | rules never act on a guess |
| US-108 | reader | a Hidden view with Unhide, and nothing ever deleted | a wrong match never costs me a story |

### AI Catch me up (stretch)

| ID | As a… | I want… | So that… |
|---|---|---|---|
| US-109 | returning reader | Catch me up to group my unread stories into a few stories with short summaries | I can catch up after days away in minutes |
| US-110 | returning reader | the digest ranked by importance | the biggest news comes first |
| US-111 | returning reader | each digest story to link to its sources in Feedolio | I can read the originals and check the summary |
| US-112 | returning reader | to mark everything as caught up | the next digest starts fresh |

### AI privacy and defaults (stretch)

| ID | As a… | I want… | So that… |
|---|---|---|---|
| US-113 | privacy-conscious reader | to see what is sent to my provider, and how much I've used this session | there are no surprises on my bill |
| US-114 | reader who doesn't want AI | the app to work fully without AI, with AI staying off until I set it up | AI never gets in my way |

## Implementation Decisions

### Platform and stack

| Concern | Decision | Why |
|---|---|---|
| UI | **React 19, JavaScript**, built with **Vite** | The brief asks for React with JavaScript. JSDoc annotations describe the core shapes so editors still catch mistakes. |
| Routing | **React Router** | Each view gets its own URL (US-09, US-27). |
| State | **Redux Toolkit**. **RTK Query** loads feed data; plain slices hold subscriptions, bookmarks and preferences. | Covers the Redux bonus without hand-written loading and caching code. Feed data is server data; the rest is client data. |
| Styling | **CSS Modules** plus global **design tokens** (CSS custom properties for colour, type, spacing and radii). Hand-made inline-SVG icons. Inter for interface text, Newsreader for headlines and story bodies. | The brief forbids CSS libraries. Tokens make light and dark themes a value swap. |
| Hosting | **Cloudflare Workers with static assets.** One Worker serves the built app and the feed endpoint. | Cloudflare now points new projects to Workers rather than Pages. Static-file requests are free and unlimited, and the free plan allows 100,000 Worker requests a day. |
| Feed parsing | **`fast-xml-parser`**, a pure-JavaScript XML-to-JSON library | Matches the brief's suggestion. It needs no Node built-ins, so it runs in Workers. Parsing the largest sample feed took about 1 ms on a laptop (3.8 ms cold), well inside the free plan's 10 ms CPU limit. `rss-parser` took 15.7 ms cold. |
| Local development | **Cloudflare's Vite plugin** | It runs the Worker in Cloudflare's local runtime inside `npm run dev`, so one command runs everything (US-79). |
| AI (stretch) | **Bring your own key, called straight from the browser:** Anthropic's official SDK in browser mode, or a small adapter for any OpenAI-compatible endpoint, plus an optional decision model | No AI backend and no AI cost to us; the reader picks the provider (module 13). |

**How requests are routed:**
- Page navigations (any app URL) are answered with the app's index page by the static-asset layer, without running the Worker.
- Only the app's own data requests to `/api/feed` run the Worker.
- **Workers Caching** is turned on in the Wrangler configuration. Cloudflare checks its cache before running the Worker and collapses simultaneous identical requests. The cache key includes the query string, so each feed URL is cached separately.
- **AI requests** (stretch) never touch the Worker. They go from the browser straight to the reader's chosen provider.

### 1. Feed endpoint (server-side proxy)

**Purpose:** fetch a feed on the reader's behalf and return clean JSON. This is required because no sample feed allows cross-site browser requests. Checked on 2026-11-06: Medium sends no `Access-Control-Allow-Origin` header, and TechCrunch allows only its own domain.

**Interface:** `GET /api/feed?url=<absolute feed or website URL>`

- **Success:** `200` with a normalised feed: feed metadata (URL, title, description, site URL, logo URL, and posts per week worked out from the story dates), a list of stories (module 2) and a `fetchedAt` timestamp.
- **Several feeds:** when the link is a web page that offers more than one feed, `200` with `choices`, the title and URL of each, so the reader can pick (US-91).
- **Errors:** a JSON body with a machine-readable `code` and a human-readable `message`.

| Code | Status | When |
|---|---|---|
| `INVALID_URL` | 400 | Not an absolute http(s) URL |
| `BLOCKED_HOST` | 400 | `localhost`, a literal private, loopback, link-local or reserved IP address (IPv4 or IPv6), or a port other than 80/443 |
| `UPSTREAM_TIMEOUT` | 504 | No upstream response within 8 s |
| `UPSTREAM_ERROR` | 502 | Upstream returned a non-2xx status (included in the body) or the connection failed |
| `NOT_A_FEED` | 422 | Neither a feed nor a web page, e.g. an image or JSON |
| `NO_FEED_FOUND` | 422 | A web page with no feed link |
| `TOO_LARGE` | 502 | Upstream body over 5 MB |

**Behaviour:**
- **Feed discovery** (US-90 to US-92): if the link returns a web page, the endpoint reads up to 1 MB of it, collects the page's `<link rel="alternate">` tags of type RSS or Atom, and fetches the feed under the same safety rules. Discovery runs once per request: a discovered link that returns another web page is `NOT_A_FEED`.
- Follows at most 3 redirects, re-checking every hop against the same rules.
- Sends an honest User-Agent and stops reading after 5 MB.
- Doesn't look up IP addresses before connecting; Workers can't do that the way Node can. The literal-address checks cover the obvious cases. Workers also run outside any private network of ours, so there is little behind them to reach.
- **Caching on success:**
  - Edge: `Cloudflare-CDN-Cache-Control: max-age=600, stale-while-revalidate=3600, stale-if-error=86400`. That means fresh for 10 minutes, served stale while refreshing for up to an hour, and served stale for up to a day if the publisher is down.
  - Browser: `Cache-Control: no-cache`, so the Refresh button always reaches the edge.
  - The edge directive deliberately avoids `s-maxage`, which on Cloudflare **turns off** stale-while-revalidate and stale-if-error.
- **Errors** are sent with `no-store`. An outage of a feed that is already cached is covered by stale-if-error.

### 2. Story normaliser

**Purpose:** pure logic inside the endpoint that turns any RSS 2.0 or Atom document into one **Story** shape, so the UI never deals with feed quirks. It does the mapping from raw XML fields itself, because the parser only converts XML to JSON.

| Field | Derived from |
|---|---|
| `id` | Stable, URL-safe hash of the guid, falling back to the link, then to title plus date |
| `title` | Title with entities decoded and whitespace trimmed |
| `link` | Publisher URL (RSS `link`, or the Atom `link` with `rel="alternate"`) |
| `author` | `dc:creator`, `author`, or the Atom author name |
| `publishedAt` | ISO timestamp from `pubDate`, `published` or `updated`; may be null |
| `categories` | Category names (RSS `category`, Atom `category@term`) |
| `excerpt` | Plain text, about 200 characters, from the description or the start of the body |
| `contentHtml` | Richest body available: `content:encoded`, then Atom `content`, then `description`. Kept raw and sanitised at render time (module 9). |
| `hasFullContent` | True when the body is meaningfully longer than the excerpt. Drives the summary-only layout (US-26). |
| `imageUrl` | The main image, or null |

**Main image rules** (US-16 to US-18). The first rule that matches wins:

1. `media:content` or `media:thumbnail` marked as an image; the largest width wins.
2. An `enclosure` with an `image/*` type.
3. The first `<img>` in the body, preferring one inside a `<figure>`. Skipped: tracking pixels (width or height of 2 px or less, or known beacon paths such as Medium's `/_/stat`), `data:` URIs, and icon-sized images.
4. Otherwise null, and the UI shows the publication's monogram tile.

The feed-level logo is never used as a story image. The rules were checked against the five default feeds:

| Feed | Rule that applies |
|---|---|
| Medium | Rule 3: the first figure is the hero; the last image is a tracking pixel and is skipped |
| BBC | Rule 1 (`media:thumbnail`) |
| The Verge (Atom) | Rule 3 |
| TechCrunch | Rule 4 (no images in the feed) |

### 3. Feed data client

**Purpose:** load feeds into the app (US-10 to US-14, US-82, US-83).

- An RTK Query API with one query, *get feed by URL*, that calls the feed endpoint.
- Results are cached per URL and kept for about 10 minutes after the last view.
- Network failures and 5xx responses are retried twice with backoff; 4xx responses are not.
- The Refresh control forces a refetch.
- **All stories** runs one query per enabled subscription, in parallel. It merges the results, removes duplicates by story id, and sorts by date with undated stories last. Each feed keeps its own loading and error state, so one failure never blanks the view (US-12).
- **Today** shows the merged stories from the last 24 hours (US-82). Every list groups stories under date headers: Today, Yesterday, Earlier this week, Older (US-83).

### 4. Subscriptions

**Purpose:** the reader's list of feeds (US-55 to US-64, US-90 to US-94).

- Each subscription has an id (a short stable hash of the normalised URL), URL, title, an *enabled in All stories* flag, an added-at time and an *is-default* flag.
- Operations: add, remove, toggle enabled, restore defaults.
- URLs are normalised before duplicate checks: lower-case host, no trailing slash, no fragment.
- **Adding a feed** is a three-step flow: check the link locally, then preview through the feed endpoint, then confirm. Any website or feed link works. The preview shows the feed's title, latest headlines and posts per week, or a choice when the page offers several feeds (US-58, US-90 to US-92).
- **Suggested feeds:** Settings offers back any starter feed the reader removed (US-94).

**Starter feeds.** Every new reader starts with these five. They can hide or remove any of them, add their own by link, and restore the starters later (US-55, US-57 to US-63).

| Feed | URL | Why |
|---|---|---|
| Backchannel | `medium.com/feed/backchannel` | Brief sample (archived: last post 2018) |
| The Economist | `medium.com/feed/the-economist` | Brief sample (archived: last post 2020) |
| TechCrunch Startups | `techcrunch.com/category/startups/feed/` | Brief sample, at its current address. TechCrunch moved its feeds under `/category/`, and the brief's old address now returns a 404 page. |
| BBC News Technology | `feeds.bbci.co.uk/news/technology/rss.xml` | Live, with images; covers `media:thumbnail` |
| The Verge | `theverge.com/rss/index.xml` | Live; covers Atom |

### 5. Bookmarks

**Purpose:** saved stories (US-36 to US-48).

- Each bookmark stores the story id, its feed id, a saved-at time, and a **snapshot of the story**: title, link, author, date, excerpt, image, body, feed title and the summary-only flag.
- **The snapshot is the key decision.** Saved stories stay readable after they leave the publisher's feed (feeds usually keep only the latest 10–20 items) and after their feed is removed (US-43, US-44).
- Operations: toggle (given a story), remove (given an id), restore (for Undo).
- Selectors: is-bookmarked, all bookmarks newest-saved first, and count.

### 6. Preferences and visit record

**Preferences** (US-65, US-85, US-86, US-89, US-115): theme (system, light or dark), layout (List or Cards), density (Comfortable or Compact), reading settings (text size, serif or sans, line width), and the sidebar (automatic by width, expanded, or collapsed).

**Visit record** (US-84, US-93, US-109 to US-112): the last visit time, the last catch-up time, and the most recent 2,000 opened story ids.
- At start-up, the app reads the previous last-visit time and uses it as this session's cut-off. Stories published after it sit above the "New since your last visit" divider.
- The last-visit time moves forward when the reader leaves the page.
- A first visit has no cut-off, so it shows the welcome note instead of a divider.
- For the Catch me up digest, "unread" means published since the last catch-up and not opened. This is a light record, not full read/unread tracking.

### 7. Persistence

**Purpose:** keep subscriptions, bookmarks and preferences across sessions (US-42, US-47, US-48, US-64).

- Subscriptions, bookmarks, preferences, the visit record, and the AI settings and rules (which hold no secrets) are written to `localStorage` under one versioned key (schema version 1). A store listener throttles writes to at most one every 500 ms.
- AI keys are never part of that key (module 13).
- On start-up, state is loaded, validated and migrated by version. Missing, corrupted or blocked storage (for example in private browsing) falls back to defaults without crashing.
- A `storage` event listener applies changes made in other tabs.
- If a write exceeds the quota, the in-memory state is kept and a warning is shown.
- **Why a custom layer:** `redux-persist` is largely unmaintained and does more than this needs.
- **Why `localStorage`:** the data is small, and loading it synchronously keeps start-up simple. A long-form snapshot is about 15 KB, so roughly 300 bookmarks fit in a 5 MB quota. IndexedDB is the documented fallback if this is outgrown.

### 8. Routing and story resolution

| Route | View |
|---|---|
| `/` | All stories |
| `/today` | Today: the last 24 hours |
| `/feeds/:feedId` | One feed |
| `/feeds/:feedId/stories/:storyId` | Story page (a separate page, as the brief requires) |
| `/bookmarks` | Saved |
| `/settings` | Settings |
| `/catch-up` | AI: Catch me up |
| `/maybe`, `/hidden` | AI: uncertain rule matches; stories hidden by rules |
| `/tags/:tag` | AI: stories a rule tagged |
| `/settings/ai`, `/settings/rules` | AI: keys and models; filter rules |
| anything else | Not found |

Adding a feed and the keyboard-shortcuts list are dialogs, not routes.

The story page finds its story in this order (US-27, US-28):

1. Feed data already in the cache.
2. Fetch the feed for that subscription and look the story up.
3. The bookmark snapshot.
4. Otherwise a "no longer available" state, linking to the original if it's known.

Feed ids are hashes of the URL, so a story URL only resolves for feeds the reader follows or has bookmarked from. That's acceptable because share buttons share the publisher's original link, not app links (US-54).

### 9. Story content renderer

**Purpose:** show `contentHtml` safely and nicely (US-22 to US-35).

- **Sanitising:** DOMPurify with an allowlist removes scripts, inline event handlers, `javascript:` URLs, styles, forms and iframes. Each iframe becomes a "View embedded media on the original site" link (US-35).
- **Links:** open in a new tab with `noopener noreferrer` (US-24).
- **Images:** lazy-loaded with `referrerpolicy="no-referrer"`.
- **Hero:** a separate hero image is shown only when the main image did not come from the body, so it never appears twice (US-33).
- **Reading time:** estimated from body word count at about 230 words per minute (US-30).
- **Reading settings:** an Aa control applies the reader's text size, font and line width to the body (US-89).

### 10. Sharing

**Purpose:** share without trackers (US-49 to US-54).

- Builds share links for the X (Twitter) web intent, Facebook sharer, LinkedIn share and `mailto:`, using the story's original link and title.
- Uses the Web Share API where the browser supports it (most phones), and the Clipboard API for Copy link.
- Offers **"Share to Facebook" rather than a Facebook "Like" button**: a Like button needs Facebook's SDK, cookies and tracking.

### 11. App shell and design system

**Purpose:** a layout that suits every screen size and works for everyone (US-66 to US-72, US-85 to US-88, US-93, US-115).

| Width | Layout |
|---|---|
| Under 640 px (phone) | Top app bar, horizontal feed chips, bottom tab bar |
| 640–1023 px (tablet) | Slide-out feed drawer |
| 1024 px and up (desktop) | Sidebar that collapses to a slim icon rail. It's expanded by default from 1280 px and collapsed at 1024–1279 px, and the reader's choice is remembered. |

- Light and dark themes switch through design tokens and follow the system setting unless overridden.
- Animations respect the reduced-motion setting.
- All controls are native buttons and links. Bookmark toggles use `aria-pressed`, every page has landmarks and one `h1`, and touch targets are at least 44 px.
- Route-level error boundaries stop one broken view from blanking the app.
- The story page, Settings and every AI view are code-split.
- **Layouts:** List or Cards, in Comfortable or Compact density (US-85, US-86).
- **Collapsible sidebar** (US-115): a toggle at the top of the sidebar shrinks it to an icon rail that keeps Today, All stories, Saved, the feeds and "Add feed", with tooltips and count badges. The toggle reports whether the sidebar is expanded, and every rail icon keeps an accessible name.
- **Keyboard shortcuts** (US-87, US-88, US-115): J/K next and previous story, Enter or O open, V open the original, S save or unsave, R refresh, `[` collapse or expand the sidebar, G then T, A or S for Today, All stories or Saved, `?` lists them all, and Esc closes. They're off while the reader is typing in a field.
- **First visit:** a welcome card explains the starter feeds and offers "Add a feed" (US-93).
- Security headers for the app's pages, including a Content Security Policy, come from Cloudflare's static-asset headers file. The Worker sets its own headers on `/api/feed` responses.

### 12. Authentication

**Purpose:** GitHub sign-in that readers can choose to use (US-73 to US-76).

- GitHub sign-in through Auth0's single-page-app SDK (authorisation code flow with PKCE). This needs no backend of our own.
- Signing in only scopes the stored data to the user id. Bookmarks and feeds stay on the device; signed-out use is the "guest" space.
- Cross-device sync is not required.

### 13. AI features (stretch)

**Purpose:** optional help that runs on the reader's own keys (US-95 to US-114). The app works fully without it, and AI controls appear only after a reader adds a key (US-114).

**Providers (bring your own key):**

| Role | Options | Used for |
|---|---|---|
| **General model** (required for AI) | Anthropic, or any OpenAI-compatible endpoint: OpenAI, OpenRouter, Ollama on the reader's computer, or a custom address | Summaries, translations, explanations; grouping and summarising the digest |
| **Decision model** (optional) | TypeSafe Jev, through TypeSafe's API, or OpenRouter once it's served there | Yes/no rule matching and importance scores, with calibrated confidence |

- **Browser access, checked 2026-11-09:** Anthropic, OpenAI and OpenRouter accept requests straight from a web page. Ollama must be told to allow Feedolio's address (its `OLLAMA_ORIGINS` setting), and some browsers ask permission before a website can reach a local server. Other OpenAI-compatible servers work only if they allow browser requests, and Test connection says so in plain words (US-98).
- **Anthropic adapter:** Anthropic's official SDK in browser mode, which is safe here because the key is the reader's own. The default model is `claude-opus-5-5`, and readers can pick any model their key lists. Effort is set per task: low for quick actions, medium for the digest. JSON answers use structured output, and refusals use Anthropic's server-side fallback.
- **OpenAI-compatible adapter:** a small adapter for chat completions, with streaming. It asks for JSON-schema output where the server supports it, and validates plain JSON otherwise.
- **Decision adapter:** TypeSafe's public API reference couldn't be found on 2026-11-09. OpenRouter lists a Jev model with a "decisions" output, but no serving endpoints yet. The request format is confirmed before the filter-rules slice. Until then, the general model does the judging.

**Task router:**

| Task | Kind | Goes to |
|---|---|---|
| Summarize, Translate, Explain | Generate, streamed | General model |
| Match a story against rules | Yes/no plus confidence | Decision model, else general |
| Group the digest into stories | Generate, JSON | General model |
| Rank digest stories | Score | Decision model, else general |
| Summarise each digest story | Generate | General model |

**The three features:**

- **Article actions** (US-100 to US-103):
  - Answers stream into a panel labelled with the model, with Copy, Regenerate and the note "AI can make mistakes. Check the original."
  - Answers are cached per story, action and language.
  - On summary-only stories, the actions work on the summary and say so.
- **Filter rules** (US-104 to US-108):
  - Each new story is checked once per rule version, in batches.
  - With a decision model: 75% or more applies the action, 40–75% goes to Maybe, and below 40% is ignored.
  - With only the general model, whose confidence is self-reported: 85% or more applies, and 30–85% goes to Maybe.
  - The reader's yes or no in Maybe is remembered and wins over the model.
  - Hidden stories stay in Hidden with Unhide. Nothing is ever deleted.
- **Catch me up** (US-109 to US-112):
  - Takes unread stories since the last catch-up, up to 60 (module 6 defines "unread"); hidden stories are left out.
  - The general model groups them into stories, citing story ids. The decision model, or the general model, ranks the groups by importance. Each group gets a short summary.
  - Source links come from Feedolio's own story data, never from model text, and unknown story ids are dropped.
  - "Mark all caught up" starts a new window.

**Key storage** (US-97, US-99):
- Keys live under their own storage key, apart from all other data.
- They're never logged, never put in error messages, and never sent to the feed endpoint.
- With "Remember on this device" off, keys last only as long as the tab.
- One action removes them all, and signed-in readers get keys per account.

**Safety.** Keys share the browser with untrusted feed content, so nothing from a feed or a model may ever run as code.
- All feed HTML goes through the sanitiser (module 9). Titles and excerpts are always plain text.
- Model output is shown as text through a small paragraph-and-list formatter of our own, never as HTML.
- Feed text is fenced and labelled as untrusted in every prompt. Models get no tools, so a hostile feed can at worst mislabel a story, and a mislabelled story stays visible in Maybe or Hidden.
- The Content Security Policy allows scripts only from Feedolio itself, with Trusted Types on. Its connection rule has to allow any https host and localhost, because readers choose their own endpoints. So the policy can't stop data leaving; preventing script injection is the real defence.

**Cost controls** (the reader pays, US-113):
- Rule checks run in batches of up to 25 stories, once per story and rule version, and never again on refresh.
- AI results are cached in the browser's IndexedDB.
- The digest is capped at 60 stories.
- Settings shows what is sent to the provider and this session's usage.

### Vocabulary

| Term | Meaning |
|---|---|
| **Feed** | An RSS or Atom document at a URL |
| **Subscription** | A feed the reader follows ("your feeds" in the UI) |
| **Story** | One item in a feed |
| **Bookmark** | A saved story. The UI says **Save / Saved**, and the nav item is **Saved**. |
| **Main image** | The image chosen to represent a story in lists |
| **Summary-only feed** | A feed whose items have a short description but no full body (TechCrunch today) |
| **Divider** | The "New since your last visit" line between new and older stories |
| **Rule** | A plain-English filter with an action: hide, highlight or tag |
| **Judgment** | A model's verdict on one story against one rule version: match, maybe or no, with a confidence |
| **Maybe** | The view for uncertain rule matches, where the reader decides |
| **Hidden** | The view for stories hidden by rules. Nothing is deleted. |
| **Digest** | The "Catch me up" summary of unread stories, grouped into a few stories |
| **General model** | The reader's main AI model: OpenAI-compatible or Anthropic |
| **Decision model** | An optional model for yes/no and scoring, e.g. TypeSafe Jev |

## Testing Decisions

### What makes a good test here

- **Test behaviour, not implementation.** Assert on what a reader sees and does, or on what the feed endpoint returns over HTTP. Never assert on Redux state shape, component props, internal calls or CSS classes. No snapshot tests. A refactor that keeps behaviour the same must keep tests green.
- **Fake only what we don't own: the internet and the clock.** AI providers count as the internet and get recorded responses. The store, router, persistence (jsdom's real `localStorage`), parser, normaliser, sanitiser and AI task router all run for real.
- **Use real fixtures.** Saved copies of the five sample feeds (captured 2026-11-06), plus hand-written edge cases:
  - hostile HTML (a `<script>`, an `onerror` attribute, a `javascript:` link),
  - an Atom feed without guids,
  - items with no dates,
  - an empty feed,
  - an HTML "Page not found" response,
  - web pages with one, several and no feed links,
  - recorded AI responses, including one whose output contains HTML and one that cites an unknown story id.
- **Freeze time** so relative times ("3h ago") are deterministic.

### Test seams (confirmed 2026-11-09)

The aim is the fewest seams, as high up as possible.

**Seam 1 (primary): the whole app at the edge of the internet.**
- Tests render the real app at a URL in jsdom and act as a reader would, using Testing Library and user-event.
- MSW intercepts network calls. Calls to `/api/feed` are handed to the **real** endpoint handler in-process. The handler uses only standard web APIs (`Request`, `Response`, `fetch`), so it runs in Node test runs as well as on Workers. The handler's own outbound requests to publishers are answered from the XML fixtures.
- One seam therefore covers the UI, data client, endpoint, parser, normaliser, main-image rules and sanitiser end to end.
- AI providers are faked at the same edge with recorded responses, so the AI journeys run through this seam too.
- A "reload" means unmounting and rebuilding the app from what's in `localStorage`.

**Seam 2 (secondary): the feed endpoint's HTTP contract.**
- This seam exists only for behaviour the UI can't observe precisely: blocked addresses, timeouts, size and redirect limits, feed discovery, status codes and cache headers.
- The handler is called directly with a request and returns a response.
- These tests run **inside Cloudflare's Workers runtime**, using Cloudflare's Vitest plugin, so they also prove the endpoint runs where it is deployed.

Journey tests through seam 1 are the main tool. Seam 2 stays small, and unit tests are added only where logic is dense enough that table-driven cases are clearer: the normaliser, main-image rules, URL guard and storage migration.

### Coverage by journey

| Journey | Seam | Stories |
|---|---|---|
| Browse: list renders from each fixture feed with source, author, time, excerpt and image or monogram; switching feeds updates list and URL | 1 | US-01 to US-09, US-16 to US-20 |
| All stories: merge, sort, and per-feed error with Retry while other feeds render | 1 | US-05, US-06, US-10 to US-13 |
| Story page: full content, summary-only layout, reload, "no longer available" | 1 | US-21 to US-33 |
| Safety: hostile HTML never reaches the DOM; links open in new tabs | 1 | US-24, US-34, US-35 |
| Bookmarks: toggle from list and story page shows the right pressed state; Saved page order; Undo | 1 | US-36 to US-41, US-45, US-46 |
| Persistence: survives reload, story leaving the feed, and feed removal; cross-tab sync through a `storage` event; quota warning | 1 | US-42 to US-44, US-47, US-48, US-64 |
| Settings: add (preview, success, not-a-feed, duplicate), hide, remove, restore defaults, theme | 1 | US-55 to US-65 |
| Sharing: correct share URLs; Copy link confirmation | 1 | US-49 to US-54 |
| Accessibility: `aria-pressed` on toggles; one `h1` per page | 1 | US-69, US-70 |
| What's new: Today shows only the last 24 hours; date headers in order; a return visit puts the divider between new and older stories; a first visit shows the welcome note and no divider | 1 | US-82 to US-84, US-93 |
| Read your way: List or Cards, density and reading settings survive a reload | 1 | US-85, US-86, US-89 |
| Keyboard: J/K, Enter, V, S, R and the G shortcuts work; `?` opens the overlay; shortcuts are off while typing | 1 | US-87, US-88 |
| Sidebar: the button and `[` collapse it to the rail and back; the choice survives a reload; rail icons keep accessible names | 1 | US-115 |
| Add any link: paste a website, pick among several feeds, preview headlines and posts per week, re-add a suggested feed | 1 | US-90 to US-92, US-94 |
| AI setup: connect each provider type, Test connection errors, remember or forget keys, remove all keys | 1 | US-95 to US-99 |
| AI article actions: streamed answers with provenance; model output containing HTML shows as text | 1 | US-100 to US-103 |
| AI filter rules: hide, highlight and tag; uncertain matches in Maybe; Hidden with Unhide; decision-model and general-model routing and thresholds | 1 | US-104 to US-108 |
| AI Catch me up: grouping, ranking, links only to real stories (unknown ids dropped), Mark all caught up | 1 | US-109 to US-112 |
| AI privacy: no request to the feed endpoint carries a key; the usage counter; the app works with AI off | 1 | US-113, US-114 |
| Endpoint contract: each error code, cache headers, normalised output for RSS, Atom and media-RSS fixtures | 2 | US-78 |
| Endpoint contract: discovery from a web page (one feed, `choices`, `NO_FEED_FOUND`) and posts per week | 2 | US-90 to US-92 |

### Prior art and tooling

- **Prior art:** none, because the repository is empty. The first slice sets the conventions: one test file per journey, fixture feeds in a shared folder, and one shared MSW setup.
- **Tooling:** Vitest, React Testing Library, user-event, MSW, and Cloudflare's Vitest plugin for seam 2.
- **Optional:** a Playwright smoke test against a Workers preview deployment checks real browsers and real feeds. It isn't a seam and doesn't block merging.

## Out of Scope

| Item | Why |
|---|---|
| Cross-device sync, or any database of our own | Not required. Data lives in the browser; with OAuth it's per account, per device. |
| Full read/unread tracking with counts (a divider covers what's new), search, folders, OPML import/export, notifications, offline mode / PWA | Good follow-ups, not part of this spec |
| Fetching full articles from publisher sites (scraping, "reader mode"), including `og:image` look-ups for image-less feeds | Summary-only feeds stay summary-only, with a clear link out |
| Facebook "Like" button and any other social SDK | Needs third-party tracking; share links are used instead |
| Rendering embedded iframes from feed content | Replaced by links to the original |
| AI that needs our own server (shared caching, scheduled or emailed digests) | AI runs only in the reader's browser, on their own keys |
| TypeScript, server-side rendering, SEO | Not asked for; the brief asks for JavaScript |
| Internationalising the interface | English only; the AI Translate button is separate |
| Rate limiting or allowlisting the feed endpoint (beyond URL checks, the size cap and caching) | The open-proxy risk is noted below |

## Further Notes

### Feed findings (inspected 2026-11-06)

| Feed | Format | Body | Images | Items | Notes |
|---|---|---|---|---|---|
| Backchannel (Medium) | RSS 2.0 | Full HTML in `content:encoded`; one item is description-only | First `<figure>` image; the last image is a tracking pixel | 10 | Archived: newest item Jan 2018 |
| The Economist (Medium) | RSS 2.0 | Full HTML | As Backchannel | 10 | Archived: newest item Apr 2020; contains `<iframe>` embeds |
| TechCrunch Startups | RSS 2.0 | Summary only (70–370 characters) | None | 20 | Moved under `/category/` (the brief's URL now 404s); guid isn't a permalink; several authors per item |
| BBC Technology | RSS 2.0 + Media RSS | Summary only | `media:thumbnail` on every item | 21 | Live |
| The Verge | Atom | Full HTML | First `<img>` in the content | 10 | Live; exercises Atom parsing |

No feed allows cross-site browser requests. Medium sends `Cache-Control: private, max-age=900`.

**TechCrunch's address change** (from live checks and Wayback Machine snapshots):
- The brief's address served the feed until mid-2022.
- From October 2022 it redirected to `/category/startups/feed/`.
- By October 2026 the redirect was gone and the old address returns a "Page not found" page.

The feed itself is alive at the new address.

### Publishing

The skill normally publishes the spec as an issue labelled `ready-for-agent`. This project has no git remote or issue tracker yet, and `/setup-matt-pocock-skills` hasn't been run. For now the spec lives here as Markdown and HTML. Once a tracker exists, publish it with the `ready-for-agent` label.

### Suggested vertical slices

These are input for a follow-up `to-issues` pass. Each slice is demoable end to end.

| # | Slice | Stories |
|---|---|---|
| 1 | **Walking skeleton:** feed endpoint plus one feed's headline list, deployed to Workers | US-01 to US-05, US-79, US-80 |
| 2 | **Story page** with sanitised content, summary-only and missing-story states | US-21 to US-35 |
| 3 | **Multiple feeds:** sidebar and chips, the All stories merge, per-feed errors | US-06 to US-15 |
| 4 | **Bookmarks:** persistence, Saved page, Undo, cross-tab sync | US-36 to US-48 |
| 5 | **Settings:** add with preview, hide, remove and restore feeds; theme | US-55 to US-65 |
| 6 | **Polish:** main images, monogram fallback, responsive layouts, accessibility pass | US-16 to US-20, US-66 to US-72 |
| 7 | **Sharing** | US-49 to US-54 |
| 8 | **GitHub sign-in** | US-73 to US-76 |
| 9 | **What's new:** Today, date headers, the "New since your last visit" divider | US-82 to US-84 |
| 10 | **Add any link:** feed discovery, choices, preview, welcome note, suggested feeds | US-90 to US-94 |
| 11 | **Read your way:** List or Cards, density, keyboard shortcuts, reading settings, collapsible sidebar | US-85 to US-89, US-115 |
| 12 | **README and final polish** | US-77, US-78, US-81 |
| 13 | **AI foundations** (stretch): keys, providers, task router, safety | US-95 to US-99, US-113, US-114 |
| 14 | **AI article actions** (stretch) | US-100 to US-103 |
| 15 | **AI filter rules, Maybe and Hidden** (stretch) | US-104 to US-108 |
| 16 | **AI Catch me up** (stretch) | US-109 to US-112 |

Slices 13 to 16 are stretch work and come last, starting with 13.

### Settled decisions

- **Testing (2026-11-09):** journey tests through seam 1 are the main tool; seam 2 covers the endpoint contract.
- **Server-side proxy:** a small Cloudflare Worker for fetching feeds is acceptable.
- **Starter feeds:** the brief's three (TechCrunch at its current address), plus BBC Technology and The Verge. Every new reader starts with them.
- **Sign-in:** cross-device sync is not required; sign-in only separates data per user on the device.
- **Priorities (2026-11-09):** adding your own feeds by link, and managing or removing them, is a Must. Light/dark theme and GitHub sign-in are Should.
- **What's new (2026-11-09):** a light "New since your last visit" divider, like Reeder. No unread counts.
- **Ideas from other readers (2026-11-09):** all seven: keyboard shortcuts, add any link, date headers, Today, List or Cards, reading settings, and the welcome note.
- **AI (2026-11-09):** stretch work. Article actions, filter rules and Catch me up, on the reader's own keys, with an optional decision model.
- **Sidebar (2026-11-09):** collapsible on desktop, to a slim icon rail; `[` toggles it.

### Known risks

| Risk | Mitigation |
|---|---|
| The feed endpoint is effectively an open proxy for RSS | Address checks, the 5 MB cap and edge caching limit abuse; rate limiting is a follow-up |
| Workers free plan: 10 ms of CPU per request | `fast-xml-parser` measured at about 1 ms on the largest sample. Caching means parsing only happens on cache misses. The paid plan ($5/month) lifts the limit if needed. |
| Workers free plan: 100,000 Worker requests a day | Far above demo traffic. Static files don't count toward it. |
| `localStorage` quota | Bookmark snapshots grow with long-form stories. There's a warning on quota errors, and IndexedDB is the fallback. |
| Archived Medium feeds look stale | Two live default feeds offset this |
| Key theft through injected script | Sanitising, text-only AI output, a strict Content Security Policy with Trusted Types, and no third-party scripts |
| Prompt injection in feed text | No tools, fenced input, limited actions; mislabelled stories stay visible in Maybe or Hidden |
| A provider blocks browser requests | Test connection explains it; OpenRouter is an alternative |
| Jev's request format is unconfirmed | The general model judges until it's confirmed, before the filter-rules slice |
| Readers surprised by AI costs | AI stays off until set up; batching, caching and a usage counter |
| Feed discovery fetches arbitrary web pages | The same URL guard, at most 1 MB of HTML, and discovery only once per request |
