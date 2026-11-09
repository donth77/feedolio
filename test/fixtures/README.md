# Test fixtures

Saved copies of real feeds and pages, plus hand-written edge cases. `web.js` maps each one to the address it came from, and both test seams serve them from there. Nothing here is reformatted: Prettier skips this folder.

## Real feeds, captured 2026-11-06

| File                      | Address                                            | Notes                                                                       |
| ------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| `backchannel.xml`         | `https://medium.com/feed/backchannel`              | RSS 2.0, full HTML; archived (newest post January 2018); one description-only item |
| `economist.xml`           | `https://medium.com/feed/the-economist`            | RSS 2.0, full HTML with embeds; archived (newest post April 2020)           |
| `techcrunch-startups.xml` | `https://techcrunch.com/category/startups/feed/`   | RSS 2.0, summaries only, no images                                          |
| `bbc-technology.xml`      | `https://feeds.bbci.co.uk/news/technology/rss.xml` | RSS 2.0 with `media:thumbnail`, summaries only                              |
| `verge.atom`              | `https://www.theverge.com/rss/index.xml`           | Atom, full HTML                                                             |

## Real pages

| File                               | Address                                | Captured   | Notes                                                                                     |
| ---------------------------------- | -------------------------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| `techcrunch-old-startups-404.html` | `https://techcrunch.com/startups/feed/` | 2026-11-06 | The brief's TechCrunch address: status 404 with `Content-Type: application/rss+xml`        |
| `verge-home.html`                  | `https://www.theverge.com/`            | 2026-11-09 | One feed link, relative (`/rss/index.xml`). `theverge.com` redirects here with a 301. |
| `github-blog-home.html`            | `https://github.blog/`                 | 2026-11-09 | Two feed links (posts and comments), plus oEmbed and JSON alternates that aren't feeds    |
| `example-com.html`                 | `https://example.com/`                 | 2026-11-09 | No feed links                                                                             |

The Verge and GitHub pages keep their `<head>` byte for byte; the body was replaced with a comment to keep the files small (the originals were 947 KB and 290 KB). Pages were fetched with Feedolio's own `User-Agent` and `Accept` headers.

## Hand-written edge cases

Served on reserved `.test` domains, which never resolve.

| File                  | Covers                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `hostile.xml`         | Script tags, event handlers, `javascript:` and `data:` links, SVG, iframes, forms and styles     |
| `empty.xml`           | A valid feed with no stories                                                                     |
| `undated.xml`         | Stories with a missing or unreadable date                                                        |
| `relative-links.atom` | Atom without entry ids, relative links, an inherited author, XHTML and plain-text content        |
| `rss1.rdf`            | RSS 1.0 (RDF), with items beside the channel and dates in `dc:date`                              |

## AI providers (`ai/`)

Served by `ai.js`, which also holds the fake test keys. Each provider accepts only its own key.

| File                        | Source                                                                              | Notes                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `anthropic-models.json`     | Recorded 2026-11-09: `GET https://api.anthropic.com/v1/models`                      | 14 models, with what each can do (effort, structured output, output limit)  |
| `anthropic-summary.sse`     | Recorded 2026-11-09: a streamed `claude-opus-5-5` summary, low effort, fallbacks on | The raw event stream, byte for byte                                         |
| `anthropic-judgments.json`  | Recorded 2026-11-09: structured output judging two stories against a rule           | `{ judgments: [{ id, match, confidence }] }`                                |
| `jev-models.json`           | Recorded 2026-11-09: `GET https://api.typesafe.ai/v1/models`                        |                                                                             |
| `jev-systemone.json`        | Recorded 2026-11-09: `POST https://api.typesafe.ai/v1/systemone`, three yes/no questions | The conference story came back at 0.53: a "Maybe"                     |
| `openrouter-models.json`    | Recorded 2026-11-09: `GET https://openrouter.ai/api/v1/models` (public)            | Five of the 461 models, keeping only the fields Feedolio reads              |
| `openrouter-key.json`       | Written to OpenRouter's documented `GET /api/v1/key` format                         |                                                                             |
| `openai-models.json`        | Written to OpenAI's documented `GET /v1/models` format                              | No OpenAI key was available to record with                                  |
| `ollama-models.json`        | Written to Ollama's documented OpenAI-compatible `GET /v1/models` format            |                                                                             |
| `custom-models.json`        | Written in the same format, for "Other OpenAI-compatible"                           |                                                                             |
| `openai-summary.sse`        | Written to OpenAI's documented chat-completions stream format                       | With the final usage chunk that `stream_options.include_usage` adds         |

Recordings were made from a local script with the developer's own keys; no key appears in any file.
