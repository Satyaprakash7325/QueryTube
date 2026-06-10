const BACKEND_URL = "http://127.0.0.1:8000";
let allResults = []; // Store raw results globally to filter & sort client-side instantly

// Elements
const qInput = document.getElementById('q');
const searchBtn = document.getElementById('searchBtn');
const grid = document.getElementById('grid');
const loader = document.getElementById('loader');
const timeEl = document.getElementById('time');
const resultCount = document.getElementById('resultCount');
const sortOrder = document.getElementById('sortOrder');
const diversityMode = document.getElementById('diversityMode');
const thresholdSlider = document.getElementById('thresholdSlider');
const thresholdValue = document.getElementById('thresholdValue');

// Modal Elements
const videoModal = document.getElementById('videoModal');
const modalIframe = document.getElementById('modalIframe');
const modalVideoTitle = document.getElementById('modalVideoTitle');
const modalVideoScore = document.getElementById('modalVideoScore');
const modalVideoChannel = document.getElementById('modalVideoChannel');
const modalVideoDesc = document.getElementById('modalVideoDesc');
const modalWatchOnYoutube = document.getElementById('modalWatchOnYoutube');
const modalCopyLink = document.getElementById('modalCopyLink');
const closeModalBtn = document.getElementById('closeModalBtn');
const toast = document.getElementById('toast');

// Event Listeners
searchBtn.addEventListener('click', () => triggerSearch());
qInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') triggerSearch();
});

thresholdSlider.addEventListener('input', () => {
  thresholdValue.textContent = `${thresholdSlider.value}%`;
  renderResults();
});

sortOrder.addEventListener('change', () => renderResults());
diversityMode.addEventListener('change', () => renderResults());
resultCount.addEventListener('change', () => triggerSearch());

closeModalBtn.addEventListener('click', closeModal);
videoModal.addEventListener('click', (e) => {
  if (e.target === videoModal) closeModal();
});

// Helper: Extract YouTube video ID
function getYouTubeId(url) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// Helper: Fix missing or malformed YouTube thumbnail URLs
function fixThumbnailURLs(videos) {
  return videos.map(video => {
    let thumb = video.thumbnail || "";
    const videoId = getYouTubeId(video.url);

    if (videoId) {
      // Create a high quality default thumbnail URL
      thumb = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    } else if (!thumb.startsWith("http")) {
      thumb = "https://upload.wikimedia.org/wikipedia/commons/b/b8/YouTube_Logo_2017.svg";
    }

    return { ...video, thumbnail: thumb };
  });
}

// Perform Search Request
async function triggerSearch() {
  const query = qInput.value.trim();
  if (!query) {
    showToast("Please enter a search term first!");
    return;
  }

  grid.innerHTML = '';
  loader.style.display = 'block';
  timeEl.textContent = 'searching...';

  const startTime = performance.now();
  const limit = parseInt(resultCount.value) || 10;
  const isDiversityActive = diversityMode.value !== 'all';
  // Fetch more candidates if diversity is enabled to ensure we have enough channels to fill the limit
  const top_k = isDiversityActive ? Math.min(50, limit * 3) : limit;

  try {
    const response = await fetch(`${BACKEND_URL}/query?query=${encodeURIComponent(query)}&top_k=${top_k}`);
    
    if (!response.ok) {
      throw new Error(`Server returned code ${response.status}`);
    }

    const data = await response.json();
    let rawResults = data.results || [];

    // Clean up thumbnail URLs using fallback logic
    allResults = fixThumbnailURLs(rawResults);

    const duration = ((performance.now() - startTime) / 1000).toFixed(2);
    timeEl.textContent = `${duration}s • ${allResults.length} matches`;
    
    loader.style.display = 'none';
    renderResults();

  } catch (error) {
    console.error(error);
    loader.style.display = 'none';
    timeEl.textContent = 'error';
    grid.innerHTML = `
      <div class="empty">
        <p style="color: #ff4fb1; font-weight: 700; font-size: 16px; margin-bottom: 8px;">Backend Connection Failed</p>
        <p style="font-size: 13px;">Make sure the FastAPI server is running at ${BACKEND_URL}</p>
        <button onclick="triggerSearch()" style="margin-top: 16px; padding: 8px 16px; border-radius: 8px; border: none; background: #7c5cff; color: white; cursor: pointer; font-weight: 600;">Retry Search</button>
      </div>
    `;
  }
}

// Render, Filter, and Sort Results client-side
function renderResults() {
  if (!allResults || allResults.length === 0) {
    grid.innerHTML = '<div class="empty">Type a query above to start semantic search.</div>';
    return;
  }

  const minMatchPercent = parseInt(thresholdSlider.value);
  const maxDistance = 1 - (minMatchPercent / 100);
  const limit = parseInt(resultCount.value) || 10;
  const diversity = diversityMode.value;
  
  // 1. Filter by threshold (keep items where cosine distance <= maxDistance)
  let filtered = allResults.filter(item => {
    const score = (typeof item.similarity_score === 'number') ? item.similarity_score : 1.0;
    return score <= maxDistance;
  });

  // 2. Sort results first so we pick the best items from each channel for diversity
  const sortMode = sortOrder.value;
  if (sortMode === 'similarity_desc') {
    // Distance low-to-high (which is similarity high-to-low)
    filtered.sort((a, b) => a.similarity_score - b.similarity_score);
  } else if (sortMode === 'similarity_asc') {
    // Distance high-to-low (which is similarity low-to-high)
    filtered.sort((a, b) => b.similarity_score - a.similarity_score);
  } else if (sortMode === 'az') {
    filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } else if (sortMode === 'za') {
    filtered.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
  } else {
    // 'rank': keep the order returned by database
    filtered.sort((a, b) => a.rank - b.rank);
  }

  // 3. Channel Diversity filtering (limit count of videos from the same channel)
  if (diversity !== 'all') {
    const maxPerChannel = parseInt(diversity);
    const channelCounts = {};
    filtered = filtered.filter(item => {
      const channel = item.channel_title || 'Unknown Channel';
      if (!channelCounts[channel]) {
        channelCounts[channel] = 0;
      }
      if (channelCounts[channel] < maxPerChannel) {
        channelCounts[channel]++;
        return true;
      }
      return false;
    });
  }

  // 4. Slice to requested limit (top_k user selected)
  filtered = filtered.slice(0, limit);

  // Display matches count in status
  const durationText = timeEl.textContent.split(' • ')[0] || '—';
  timeEl.textContent = `${durationText} • ${filtered.length} shown`;

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty">No results match the current Match Score (≥ ${minMatchPercent}%). Try lowering the match filter.</div>`;
    return;
  }

  // Generate cards
  grid.innerHTML = filtered.map((video, index) => {
    const score = video.similarity_score;
    // Convert distance to match percentage
    const matchPercentage = (typeof score === 'number') ? Math.max(0, Math.min(100, Math.round((1 - score) * 100))) : 0;
    const scoreFormatted = `${matchPercentage}% Match`;
    
    // Similarity class based on match percentage
    let scoreClass = 'score-far';
    if (matchPercentage >= 45) scoreClass = 'score-close';
    else if (matchPercentage >= 20) scoreClass = 'score-medium';

    const shortDesc = video.description && video.description !== 'No description'
      ? escapeHtml(video.description)
      : 'No description available for this video.';

    return `
      <div class="card result-card-anim" style="animation-delay: ${index * 0.05}s">
        <div class="thumb" onclick="openVideoModal('${escapeAttr(video.title)}', '${escapeAttr(video.channel_title)}', '${escapeAttr(video.description)}', '${escapeAttr(video.url)}', ${score})">
          <img src="${video.thumbnail}" alt="${escapeAttr(video.title)}" loading="lazy">
          <div class="rank-badge">#${video.rank}</div>
        </div>
        <h3>${escapeHtml(video.title)}</h3>
        <div class="meta">
          <span>📺 ${escapeHtml(video.channel_title)}</span>
        </div>
        <p class="desc">${shortDesc}</p>
        <div class="cta-row">
          <button class="watch" onclick="openVideoModal('${escapeAttr(video.title)}', '${escapeAttr(video.channel_title)}', '${escapeAttr(video.description)}', '${escapeAttr(video.url)}', ${score})">▶ Play Inline</button>
          <div class="score-pill-inline ${scoreClass}">✨ ${scoreFormatted}</div>
          <button class="copy" onclick="copyToClipboard('${escapeAttr(video.url)}')">Link</button>
        </div>
      </div>
    `;
  }).join('');
}

// Modal functions
function openVideoModal(title, channel, desc, url, score) {
  const videoId = getYouTubeId(url);
  if (!videoId) {
    showToast("Invalid YouTube URL - cannot play inline.");
    return;
  }

  modalIframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
  modalVideoTitle.textContent = title;
  modalVideoChannel.textContent = `📺 ${channel}`;
  modalVideoDesc.textContent = desc && desc !== 'No description' ? desc : 'No description transcript available.';
  const matchPercentage = (typeof score === 'number') ? Math.max(0, Math.min(100, Math.round((1 - score) * 100))) : 0;
  modalVideoScore.textContent = `✨ Match Score: ${matchPercentage}%`;
  
  modalWatchOnYoutube.href = url;
  
  // Set up click event for modal copy link
  modalCopyLink.onclick = () => copyToClipboard(url);

  videoModal.style.display = 'flex';
  document.body.style.overflow = 'hidden'; // Stop background scrolling
}

function closeModal() {
  videoModal.style.display = 'none';
  modalIframe.src = ''; // Unload iframe to stop video audio
  document.body.style.overflow = 'auto'; // Re-enable background scrolling
}

// Clipboard copier
function copyToClipboard(text) {
  if (!text || text === '#') return;
  navigator.clipboard.writeText(text)
    .then(() => showToast("Copied link to clipboard!"))
    .catch(err => {
      console.error('Failed to copy text: ', err);
      showToast("Failed to copy link.");
    });
}

// Toast indicator
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

// Escape utilities
function escapeHtml(s) {
  return (s || '').replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

function escapeAttr(s) {
  return (s || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

// Auto-run landing state
renderResults();
