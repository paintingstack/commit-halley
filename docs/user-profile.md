# User Profile

Who uses Commit Halley and why.

## Primary user

A software developer who is active on GitHub. They have multiple public repositories with a meaningful commit history. They are curious about their own patterns and enjoy self-reflection tools that are visual and quick to use.

They do not want to install anything, create an account, or configure settings. They want to type a username and see a result.

## How they find it

- Someone shares their own Commit Halley chart on social media or in a team chat
- They see a link in a GitHub README or developer profile
- They stumble on it through a "cool developer tools" list or Hacker News thread

## What they do

1. See Torvalds' chart loaded by default. Immediately understand what the tool does.
2. Enter their own username. See their own chart.
3. Look at the biggest tiles and react. "Of course 'fix' is the biggest." Or "I had no idea I write 'update' that much."
4. Click a tile. See every commit with that word highlighted. Click through to GitHub.
5. Enter a colleague's username. Compare results. Share screenshots.
6. Try famous developers from the suggestions bar.

## What makes them come back

They do not come back often. This is a one-to-three visit tool per person. The value is in the initial discovery and the sharing moment. Retention is not the goal. Reach is.

Each user who shares their chart brings new users who each share theirs. The growth model is viral, not habitual.

## What they care about

- Speed. The chart should appear fast.
- Accuracy. The data should be real and verifiable.
- Honesty. No hidden filtering, no manipulation of results. The stop words list is visible.
- Shareability. The chart should look good in a screenshot.
- Privacy. No tracking, no accounts, no data collection.

## What they do not care about

- Customization. They do not want to choose fonts, colors, or layouts.
- Filtering by date, language, or repository. They want the full picture.
- Downloading data. The visual is the product.
- Historical trends over time. One snapshot is enough.

## Edge cases

- A new developer with very few commits: the chart will be sparse, but that is still a truthful representation.
- A developer who uses conventional commits ("feat:", "fix:", "chore:"): the prefixes become part of the vocabulary, which is valid. It shows they follow conventions.
- A developer whose commits are mostly in a non-English language: the chart works in any language. Stop words are English-only, so non-English words pass through unfiltered, which is correct.
- A developer with hundreds of repositories: the tool fetches up to 100 commits per repo and handles pagination for the repo list. Rate limits are the constraint, solved by adding a token.
