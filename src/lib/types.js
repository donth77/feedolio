/**
 * Shapes shared by the app and the Worker: what GET /api/feed returns.
 * This file holds JSDoc typedefs only.
 */

/**
 * One story, the same shape for every feed format.
 *
 * @typedef {Object} Story
 * @property {string}      id              Hash of guid, else link, else title + date, e.g. "s_8f2c1a"
 * @property {string}      feedId
 * @property {string}      title           Plain text
 * @property {string}      link            The publisher's page; what Share uses
 * @property {string|null} author
 * @property {string|null} publishedAt     ISO; stories without a date sort last
 * @property {string[]}    categories
 * @property {string}      excerpt         Plain text, up to about 200 characters
 * @property {string}      contentHtml     Raw HTML; sanitised only when rendered
 * @property {boolean}     hasFullContent  false for summary-only feeds
 * @property {string|null} imageUrl        Main image; null shows the monogram tile
 * @property {'media'|'enclosure'|'content'|null} imageSource  Lets the story page skip a duplicate hero
 */

/**
 * @typedef {Object} FeedInfo
 * @property {string}      id
 * @property {string}      url
 * @property {string}      title
 * @property {string}      description
 * @property {string|null} siteUrl
 * @property {string|null} imageUrl
 * @property {number|null} postsPerWeek
 */

/**
 * A successful GET /api/feed response.
 *
 * @typedef {Object} FeedResponse
 * @property {FeedInfo} feed
 * @property {Story[]}  stories
 * @property {string}   fetchedAt  ISO
 */

/**
 * Returned instead of a feed when a web page links to several feeds.
 *
 * @typedef {Object} FeedChoices
 * @property {{ title: string, url: string }[]} choices
 */

/**
 * The body of every GET /api/feed error.
 *
 * @typedef {Object} FeedError
 * @property {{ code: string, message: string, upstreamStatus?: number }} error
 */

export {};
