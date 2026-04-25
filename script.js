/* ── Constants ──────────────────────────────────────── */

const GITHUB_API_BASE = 'https://api.github.com';
const SEARCH_PER_PAGE = 100;
const SEARCH_MAX_RESULTS = 1000;
const MIN_WORD_LENGTH = 2;
const MAX_WORDS_DISPLAYED = 200;
const DEFAULT_USERNAME = 'torvalds';
const CACHE_FILE = `cache-${DEFAULT_USERNAME}.json`;

const PALETTE = [
  '#1a1a1a',  // ivory black
  '#f5f0e8',  // titanium white
  '#b7312c',  // cadmium red
  '#1e3a5f',  // ultramarine blue
  '#d4a017',  // yellow ochre
  '#2e6b4f',  // viridian green
  '#e8732a',  // cadmium orange
  '#5b3a6b',  // cobalt violet
];

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'shall', 'should', 'may', 'might', 'can', 'could', 'it', 'its',
  'this', 'that', 'these', 'those', 'he', 'she', 'they', 'we', 'you',
  'me', 'my', 'your', 'his', 'her', 'our', 'their', 'who', 'what',
  'which', 'when', 'where', 'how', 'why', 'not', 'no', 'so', 'if',
  'as', 'up', 'out', 'into', 'than', 'then', 'also', 'just', 'only',
  'very', 'too', 'all', 'some', 'any', 'each', 'every', 'both', 'few',
  'more', 'most', 'other', 'same', 'own', 'such', 'about', 'after',
  'before', 'between', 'through', 'during', 'above', 'below', 'over',
  'under', 'again', 'further', 'once', 'here', 'there', 'now',
]);


/* ── State ──────────────────────────────────────────── */

let storedCommits = [];
let isLoading = false;


/* ── Helpers ────────────────────────────────────────── */

function getWordColor(word) {
  let hash = 0;
  for (let i = 0; i < word.length; i++) {
    hash = ((hash << 5) - hash) + word.charCodeAt(i);
    hash |= 0;
  }
  return PALETTE[Math.abs(hash % PALETTE.length)];
}

function getTextColor(backgroundColor) {
  const hex = backgroundColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#111111' : '#ffffff';
}

function parseNextPageUrl(linkHeader) {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  if (!match) return null;
  const url = match[1];
  if (!url.startsWith(GITHUB_API_BASE + '/')) return null;
  return url;
}

function measureTextWidth(text, fontSize) {
  const canvas = measureTextWidth.canvas ||
    (measureTextWidth.canvas = document.createElement('canvas'));
  const context = canvas.getContext('2d');
  context.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
  return context.measureText(text).width;
}

function escapeHtml(text) {
  const div = escapeHtml.div || (escapeHtml.div = document.createElement('div'));
  div.textContent = text;
  return div.innerHTML;
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightWord(text, word) {
  const escaped = escapeHtml(text);
  const regex = new RegExp(`(${escapeRegex(word)})`, 'gi');
  return escaped.replace(regex, '<mark>$1</mark>');
}

function isGitHubUrl(url) {
  return url && url.startsWith('https://github.com/');
}


/* ── GitHub API ─────────────────────────────────────── */

async function searchCommits(username, onProgress) {
  const encoded = encodeURIComponent(username);
  const allCommits = [];
  let page = 1;
  let totalCount = 0;

  while (allCommits.length < SEARCH_MAX_RESULTS) {
    onProgress(`Fetching commits (page ${page})...`);

    const url =
      `${GITHUB_API_BASE}/search/commits` +
      `?q=author:${encoded}&per_page=${SEARCH_PER_PAGE}&page=${page}&sort=author-date&order=desc`;

    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.github.cloak-preview+json' },
    });

    if (!response.ok) {
      if (response.status === 422) {
        throw new Error('User not found.');
      }

      if (response.status === 403 || response.status === 429) {
        if (allCommits.length > 0) break;
        const resetTimestamp = response.headers.get('X-RateLimit-Reset');
        const resetDate = new Date(Number(resetTimestamp) * 1000);
        throw new Error(`Rate limited. Try again at ${resetDate.toLocaleTimeString()}.`);
      }

      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();
    totalCount = data.total_count;

    if (data.items.length === 0) break;

    for (const item of data.items) {
      allCommits.push({
        message: item.commit.message.split('\n')[0],
        repo: item.repository.full_name,
        url: item.html_url,
      });
    }

    onProgress(`${allCommits.length} / ${Math.min(totalCount, SEARCH_MAX_RESULTS)} commits`);

    if (data.items.length < SEARCH_PER_PAGE) break;
    page++;
  }

  return { commits: allCommits, totalCount };
}


/* ── Word Processing ────────────────────────────────── */

function tokenizeMessages(commits) {
  const words = [];

  for (const commit of commits) {
    const cleaned = commit.message
      .toLowerCase()
      .replace(/[^\p{L}\s]/gu, ' ');
    const tokens = cleaned.split(/\s+/);

    for (const token of tokens) {
      if (token.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(token)) {
        words.push(token);
      }
    }
  }

  return words;
}

function countWordFrequencies(words) {
  const counts = {};

  for (const word of words) {
    counts[word] = (counts[word] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_WORDS_DISPLAYED);
}

function findCommitsWithWord(word) {
  const results = [];

  for (const commit of storedCommits) {
    if (commit.message.toLowerCase().includes(word.toLowerCase())) {
      results.push(commit);
    }
  }

  return results;
}


/* ── Commit Panel ───────────────────────────────────── */

function openCommitPanel(word) {
  const panel = document.getElementById('commit-panel');
  const title = document.getElementById('commit-panel-title');
  const list = document.getElementById('commit-panel-list');

  const commits = findCommitsWithWord(word);
  title.textContent = `"${word}" (${commits.length})`;

  list.innerHTML = '';

  for (const commit of commits) {
    const item = document.createElement('div');
    item.className = 'commit-item';

    const commitLink = isGitHubUrl(commit.url)
      ? `<a href="${escapeHtml(commit.url)}" target="_blank" rel="noopener" class="commit-link">view</a>`
      : '';

    const repoUrl = commit.url ? commit.url.split('/commit/')[0] : '';
    const repoHtml = isGitHubUrl(repoUrl)
      ? `<a href="${escapeHtml(repoUrl)}" target="_blank" rel="noopener" class="commit-repo">${escapeHtml(commit.repo)}</a>`
      : `<span class="commit-repo">${escapeHtml(commit.repo)}</span>`;

    item.innerHTML =
      `<div>${highlightWord(commit.message, word)}</div>` +
      `<div class="commit-meta">${repoHtml}${commitLink}</div>`;
    list.appendChild(item);
  }

  panel.classList.add('open');
  document.body.classList.add('panel-open');
}

function closeCommitPanel() {
  document.getElementById('commit-panel').classList.remove('open');
  document.body.classList.remove('panel-open');
}


/* ── Rendering ──────────────────────────────────────── */

function renderChart(wordCounts) {
  const container = document.getElementById('chart');
  container.innerHTML = '';

  if (wordCounts.length === 0) {
    container.innerHTML = '<p class="empty">No commit messages found.</p>';
    return;
  }

  const rect = container.getBoundingClientRect();
  const width = rect.width;
  const isMobile = width < 600;
  const height = isMobile ? width * 1.5 : width * 0.75;

  const svg = d3.select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  const treemap = d3.treemap()
    .size([width, height])
    .tile(d3.treemapSquarify.ratio(1))
    .padding(1.5)
    .round(true);

  const root = d3.hierarchy({ children: wordCounts })
    .sum(d => d.count)
    .sort((a, b) => b.value - a.value);

  treemap(root);

  const nodes = root.leaves();

  const group = svg.selectAll('g')
    .data(nodes)
    .join('g')
    .attr('transform', d => `translate(${d.x0},${d.y0})`);

  group.append('rect')
    .attr('width', d => d.x1 - d.x0)
    .attr('height', d => d.y1 - d.y0)
    .attr('fill', d => getWordColor(d.data.word))
    .attr('class', 'bubble');

  group.each(function (d) {
    const cellWidth = d.x1 - d.x0;
    const cellHeight = d.y1 - d.y0;
    const maxWidth = cellWidth * 0.85;
    const maxHeight = cellHeight * 0.5;
    let fontSize = Math.min(maxHeight, 48);

    while (fontSize > 5) {
      const textWidth = measureTextWidth(d.data.word, fontSize);
      if (textWidth <= maxWidth) break;
      fontSize -= 0.5;
    }

    if (fontSize < 6) return;

    const bgColor = getWordColor(d.data.word);
    const textColor = getTextColor(bgColor);

    d3.select(this).append('text')
      .text(d.data.word)
      .attr('x', cellWidth / 2)
      .attr('y', cellHeight / 2)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', `${fontSize}px`)
      .attr('fill', textColor)
      .attr('opacity', 0.9)
      .attr('class', 'bubble-label');
  });

  const tooltip = document.getElementById('tooltip');

  group
    .on('mouseenter', (event, d) => {
      tooltip.textContent = `${d.data.word} ${d.data.count}`;
      tooltip.style.display = 'block';

      d3.select(event.currentTarget).select('rect')
        .attr('stroke', '#111')
        .attr('stroke-width', 1.5);
    })
    .on('mousemove', (event) => {
      tooltip.style.left = `${event.pageX + 12}px`;
      tooltip.style.top = `${event.pageY - 28}px`;
    })
    .on('mouseleave', (event) => {
      tooltip.style.display = 'none';

      d3.select(event.currentTarget).select('rect')
        .attr('stroke', 'none');
    })
    .on('click', (event, d) => {
      openCommitPanel(d.data.word);
    });
}

function renderStopWordsList() {
  const container = document.getElementById('stop-words');
  const sortedWords = [...STOP_WORDS].sort();
  container.textContent = sortedWords.join(', ');
}

function showStatus(message) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = 'status';
}

function showError(message) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = 'status error';
}


/* ── Main ───────────────────────────────────────────── */

function processAndRender(commits, totalCount) {
  storedCommits = commits;
  const words = tokenizeMessages(commits);
  const wordCounts = countWordFrequencies(words);

  const countNote = totalCount > SEARCH_MAX_RESULTS
    ? ` (showing ${commits.length} of ${totalCount.toLocaleString()})`
    : '';

  showStatus(`${commits.length} commits / ${words.length} words / ${wordCounts.length} unique${countNote}`);
  renderChart(wordCounts);
}

function setUrlUser(username) {
  const url = new URL(window.location);
  url.searchParams.set('user', username);
  history.replaceState(null, '', url);
}

function getUrlUser() {
  const params = new URLSearchParams(window.location.search);
  return params.get('user');
}

async function generateChart(username) {
  if (isLoading) return;
  isLoading = true;

  const submitButton = document.getElementById('submit-button');

  setUrlUser(username);
  submitButton.disabled = true;
  closeCommitPanel();
  showStatus('Searching commits...');

  const chart = document.getElementById('chart');
  chart.classList.add('loading');

  try {
    const result = await searchCommits(username, showStatus);

    if (result.commits.length === 0) {
      showError('No commits found.');
      return;
    }

    processAndRender(result.commits, result.totalCount);
  } catch (error) {
    showError(error.message);
  } finally {
    isLoading = false;
    submitButton.disabled = false;
    chart.classList.remove('loading');
  }
}

function handleSubmit(event) {
  event.preventDefault();
  const username = document.getElementById('username-input').value.trim();
  if (!username) return;
  generateChart(username);
}

function handleSuggestionClick(event) {
  const username = event.target.dataset.username;
  if (!username) return;
  document.getElementById('username-input').value = username;
  generateChart(username);
}

async function loadDefaultChart() {
  document.getElementById('username-input').value = DEFAULT_USERNAME;

  try {
    const response = await fetch(CACHE_FILE);
    if (!response.ok) return;
    const commits = await response.json();
    processAndRender(commits, commits.length);
  } catch {
    // Cache not available
  }
}

function init() {
  document.getElementById('search-form').addEventListener('submit', handleSubmit);
  document.getElementById('commit-panel-close').addEventListener('click', closeCommitPanel);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeCommitPanel();
  });

  const suggestions = document.querySelectorAll('.suggestion');
  for (const button of suggestions) {
    button.addEventListener('click', handleSuggestionClick);
  }

  renderStopWordsList();

  const urlUser = getUrlUser();
  if (urlUser) {
    document.getElementById('username-input').value = urlUser;
    generateChart(urlUser);
  } else {
    loadDefaultChart();
  }
}

document.addEventListener('DOMContentLoaded', init);
