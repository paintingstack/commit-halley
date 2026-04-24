# Commit Halley

See which words you actually use in your commit messages.

[Live demo](https://paintingstack.github.io/commit-halley) -- loads with Torvalds' commits by default.

## How it works

Enter a GitHub username. Commit Halley fetches all non-fork public repos and their commit messages, counts word frequencies, and renders them as colored tiles. Bigger tile, more frequent word.

Click any tile to see every commit containing that word, with links to the commit and repo on GitHub.

Share any chart via URL: `?user=username`.

Common stop words (the, a, and, is...) are excluded. The full list is visible at the bottom of the page.

## Token

Without a token: public repos only, 60 API requests per hour.

With a token: your private repos, 5,000 requests per hour.

Generate one at [github.com/settings/tokens/new](https://github.com/settings/tokens/new) with `public_repo` scope (or `repo` for private repos). Your token is stored in sessionStorage (cleared when you close the tab) and sent only to the GitHub API. No server, no tracking, no third parties.

If the rate limit is hit mid-fetch, the chart renders with whatever repos were already fetched.

## Tech

Static site. No framework, no build step, no backend.

- `index.html`, `style.css`, `script.js`
- D3.js (CDN) for the treemap layout
- GitHub REST API called client-side from the browser
- GitHub Pages for hosting

## License

MIT
