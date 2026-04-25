/* ── Constants ──────────────────────────────────────── */

const GITHUB_API_BASE = 'https://api.github.com';
const COMMITS_PER_PAGE = 100;
const REPOS_PER_PAGE = 100;
const MIN_WORD_LENGTH = 2;
const MAX_WORDS_DISPLAYED = 200;
const TOKEN_STORAGE_KEY = 'commit-halley-token';
const DEFAULT_USERNAME = 'torvalds';
const CACHE_FILE = `cache-${DEFAULT_USERNAME}.json`;
const CONCURRENT_FETCHES = 5;

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

async function githubFetch(url, token) {
  const headers = { Accept: 'application/vnd.github.v3+json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const remaining = response.headers.get('X-RateLimit-Remaining');

    if (response.status === 403 && remaining === '0') {
      const resetTimestamp = response.headers.get('X-RateLimit-Reset');
      const resetDate = new Date(Number(resetTimestamp) * 1000);
      throw new Error(
        `Rate limited. Resets at ${resetDate.toLocaleTimeString()}. Add a token for higher limits.`
      );
    }

    if (response.status === 404) {
      throw new Error('User not found.');
    }

    throw new Error(`GitHub API error: ${response.status}`);
  }

  const data = await response.json();
  const linkHeader = response.headers.get('Link');
  const nextPageUrl = parseNextPageUrl(linkHeader);

  return { data, nextPageUrl };
}

async function fetchAllPages(url, token) {
  const results = [];
  let currentUrl = url;

  while (currentUrl) {
    const { data, nextPageUrl } = await githubFetch(currentUrl, token);
    results.push(...data);
    currentUrl = nextPageUrl;
  }

  return results;
}

async function fetchRepos(username, token) {
  const encoded = encodeURIComponent(username);
  const url = `${GITHUB_API_BASE}/users/${encoded}/repos?per_page=${REPOS_PER_PAGE}&sort=pushed`;
  return fetchAllPages(url, token);
}

async function fetchRepoCommits(repoFullName, username, token) {
  const [owner, repo] = repoFullName.split('/');
  const encoded = encodeURIComponent(username);
  const url =
    `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits` +
    `?author=${encoded}&per_page=${COMMITS_PER_PAGE}`;
  const { data } = await githubFetch(url, token);
  return data;
}

async function fetchAllCommitData(username, token, onProgress) {
  const repos = await fetchRepos(username, token);
  const ownRepos = repos.filter(repo => !repo.fork);

  if (ownRepos.length === 0) {
    throw new Error('No repositories found for this user.');
  }

  onProgress(`Found ${ownRepos.length} repositories`);

  const allCommits = [];
  let completed = 0;

  for (let i = 0; i < ownRepos.length; i += CONCURRENT_FETCHES) {
    const batch = ownRepos.slice(i, i + CONCURRENT_FETCHES);

    const results = await Promise.allSettled(
      batch.map(repo => fetchRepoCommits(repo.full_name, username, token))
    );

    for (let j = 0; j < results.length; j++) {
      completed++;
      const result = results[j];
      const repo = batch[j];

      if (result.status === 'fulfilled') {
        for (const commit of result.value) {
          allCommits.push({
            message: commit.commit.message.split('\n')[0],
            repo: repo.name,
            url: commit.html_url,
          });
        }
      } else if (result.reason?.message?.includes('Rate limited')) {
        return { commits: allCommits, partial: true, completed, total: ownRepos.length };
      }
    }

    onProgress(`${completed}/${ownRepos.length} repos`);
  }

  return { commits: allCommits, partial: false, completed: ownRepos.length, total: ownRepos.length };
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

function processAndRender(commits) {
  storedCommits = commits;
  const words = tokenizeMessages(commits);
  const wordCounts = countWordFrequencies(words);
  showStatus(`${commits.length} commits / ${words.length} words / ${wordCounts.length} unique`);
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
  const tokenInput = document.getElementById('token-input');
  const submitButton = document.getElementById('submit-button');

  const token = tokenInput.value.trim();
  if (token) {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  }

  setUrlUser(username);
  submitButton.disabled = true;
  closeCommitPanel();
  showStatus('Fetching repositories...');

  const chart = document.getElementById('chart');
  chart.classList.add('loading');

  try {
    const result = await fetchAllCommitData(username, token, showStatus);

    if (result.commits.length === 0) {
      showError('No commits found.');
      return;
    }

    processAndRender(result.commits);

    if (result.partial) {
      showStatus(
        `Rate limited: showing ${result.completed}/${result.total} repos. Add a token for higher limits.`
      );
    }
  } catch (error) {
    showError(error.message);
  } finally {
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

function loadSavedToken() {
  const savedToken = sessionStorage.getItem(TOKEN_STORAGE_KEY);
  if (savedToken) {
    document.getElementById('token-input').value = savedToken;
  }
}

function toggleTokenHelp() {
  document.getElementById('token-help').classList.toggle('open');
}

async function loadDefaultChart() {
  document.getElementById('username-input').value = DEFAULT_USERNAME;

  try {
    const response = await fetch(CACHE_FILE);
    if (!response.ok) return;
    const commits = await response.json();
    processAndRender(commits);
  } catch {
    // Cache not available
  }
}

function init() {
  document.getElementById('search-form').addEventListener('submit', handleSubmit);
  document.getElementById('commit-panel-close').addEventListener('click', closeCommitPanel);
  document.getElementById('token-help-toggle').addEventListener('click', toggleTokenHelp);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeCommitPanel();
  });

  const suggestions = document.querySelectorAll('.suggestion');
  for (const button of suggestions) {
    button.addEventListener('click', handleSuggestionClick);
  }

  loadSavedToken();
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
