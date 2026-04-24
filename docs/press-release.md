# Commit Halley: See Your Developer Identity Through Your Commit Messages

**FOR IMMEDIATE RELEASE**

## What developers write reveals who they are

Every developer has a vocabulary fingerprint hidden in their commit messages. Some are builders, their history dominated by "add", "create", "implement". Others are fixers, with "fix", "patch", "resolve" towering above everything else. Some are gardeners, constantly "refactor", "clean", "update".

Until now, this fingerprint was invisible, buried across hundreds of repositories and thousands of commits.

**Commit Halley** makes it visible. Enter any GitHub username and see their commit message vocabulary rendered as a colored treemap. Bigger tile, more frequent word. Click any tile to see every commit that contains that word, linked directly to GitHub.

## How it works

Commit Halley fetches all public repositories for a GitHub user, extracts every commit message, and counts word frequencies. The result is a single, shareable visualization that captures a developer's habits, priorities, and personality.

No sign-up. No backend. No data stored. Everything runs in the browser. The code is open source.

The page loads instantly with Linus Torvalds' commit data cached, so visitors see exactly what the tool does before they type anything. Developers who want to include their private repositories can add a GitHub personal access token. The token never leaves the browser.

## Why it matters

Developer profiles today are static lists of repositories and green squares on a calendar. They show volume, not character. Commit Halley adds a new dimension: what you actually say when you ship code.

It is fun, shareable, and occasionally humbling. When your biggest tile is "wip", you learn something about yourself.

## Availability

Commit Halley is live at [paintingstack.github.io/commit-halley](https://paintingstack.github.io/commit-halley). The source code is available at [github.com/paintingstack/commit-halley](https://github.com/paintingstack/commit-halley) under the MIT license.

Built by [Paintingstack](https://paintingstack.com).

---

**Contact:** github.com/paintingstack/commit-halley/issues
