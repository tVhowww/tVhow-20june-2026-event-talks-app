// State variables
let releaseNotes = [];
let currentFilter = 'all';
let searchQuery = '';

// SVG Progress Ring calculations
const circle = document.querySelector('.progress-ring__circle');
const radius = circle.r.baseVal.value;
const circumference = radius * 2 * Math.PI;

circle.style.strokeDasharray = `${circumference} ${circumference}`;
circle.style.strokeDashoffset = circumference;

// Initialize lucide icons
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    fetchReleases();
    setupEventListeners();
});

// Setup DOM Event Listeners
function setupEventListeners() {
    // Refresh button
    const refreshBtn = document.getElementById('refresh-btn');
    refreshBtn.addEventListener('click', () => {
        fetchReleases(true);
    });

    // Search bar input
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        renderFeed();
    });

    // Clear search buttons (e.g. from empty state)
    const clearSearchBtn = document.getElementById('clear-search-btn');
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        
        // Reset category filter to all
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        const allChip = document.querySelector('.filter-chip[data-filter="all"]');
        if (allChip) allChip.classList.add('active');
        currentFilter = 'all';

        renderFeed();
    });

    // Category filter chips
    const filterChips = document.querySelectorAll('.filter-chip');
    filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            filterChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentFilter = chip.getAttribute('data-filter');
            renderFeed();
        });
    });

    // Close Tweet Modal
    const closeModalBtn = document.getElementById('close-modal-btn');
    const tweetModal = document.getElementById('tweet-modal');
    closeModalBtn.addEventListener('click', () => {
        tweetModal.classList.remove('active');
    });

    // Close modal when clicking on overlay
    tweetModal.addEventListener('click', (e) => {
        if (e.target === tweetModal) {
            tweetModal.classList.remove('active');
        }
    });

    // Live character counter updates in textarea
    const tweetTextarea = document.getElementById('tweet-textarea');
    tweetTextarea.addEventListener('input', (e) => {
        updateCharCount(e.target.value);
    });

    // Copy Tweet to clipboard
    const copyTweetBtn = document.getElementById('copy-tweet-btn');
    copyTweetBtn.addEventListener('click', () => {
        const text = tweetTextarea.value;
        navigator.clipboard.writeText(text).then(() => {
            const btnSpan = copyTweetBtn.querySelector('span');
            const originalText = btnSpan.textContent;
            btnSpan.textContent = 'Copied!';
            
            // Swap icon temporarily
            const icon = copyTweetBtn.querySelector('i');
            icon.setAttribute('data-lucide', 'check');
            lucide.createIcons();

            setTimeout(() => {
                btnSpan.textContent = originalText;
                icon.setAttribute('data-lucide', 'copy');
                lucide.createIcons();
            }, 2000);
        }).catch(err => {
            console.error('Could not copy text: ', err);
        });
    });

    // Publish tweet (Open Twitter Intent)
    const publishTweetBtn = document.getElementById('publish-tweet-btn');
    publishTweetBtn.addEventListener('click', () => {
        const text = encodeURIComponent(tweetTextarea.value);
        const twitterUrl = `https://x.com/intent/tweet?text=${text}`;
        window.open(twitterUrl, '_blank', 'width=550,height=420');
    });
}

// Fetch Release Notes from API
function fetchReleases(forceRefresh = false) {
    const loader = document.getElementById('feed-loader');
    const container = document.getElementById('feed-container');
    const emptyState = document.getElementById('empty-state');
    const refreshBtn = document.getElementById('refresh-btn');
    const refreshIcon = refreshBtn.querySelector('.btn-spinner');
    const banner = document.getElementById('feed-banner');
    
    // UI Loading state
    loader.style.display = 'flex';
    container.style.display = 'none';
    emptyState.style.display = 'none';
    refreshBtn.disabled = true;
    refreshIcon.classList.add('spinning');
    
    let url = '/api/releases';
    if (forceRefresh) {
        url += '?refresh=true';
    }

    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(res => {
            if (res.status === 'success') {
                releaseNotes = res.data;
                
                // Show banner if we are using cached data or if there's a warning
                if (res.warning) {
                    banner.style.display = 'block';
                    document.getElementById('banner-message').textContent = res.warning;
                    banner.className = 'feed-banner warning';
                } else if (res.cached && !forceRefresh) {
                    banner.style.display = 'block';
                    document.getElementById('banner-message').textContent = `Showing cached data. Last fetched: ${res.last_updated}`;
                    banner.className = 'feed-banner';
                } else {
                    banner.style.display = 'none';
                }

                // Update last updated text
                document.getElementById('last-updated-time').textContent = `Updated: ${res.last_updated.split(' ')[1] || 'Just now'}`;

                renderFeed();
            } else {
                showErrorState(res.message);
            }
        })
        .catch(err => {
            console.error('Error fetching release notes:', err);
            showErrorState(err.message || 'Failed to connect to backend server.');
        })
        .finally(() => {
            loader.style.display = 'none';
            refreshBtn.disabled = false;
            refreshIcon.classList.remove('spinning');
        });
}

function showErrorState(errorMsg) {
    const banner = document.getElementById('feed-banner');
    banner.style.display = 'block';
    banner.className = 'feed-banner error';
    document.getElementById('banner-message').textContent = `Error: ${errorMsg}`;
    
    const container = document.getElementById('feed-container');
    container.innerHTML = `
        <div class="empty-state-container">
            <div class="empty-icon" style="color: var(--color-deprecated); background: var(--color-deprecated-bg)">
                <i data-lucide="alert-octagon"></i>
            </div>
            <h2>Unable to load releases</h2>
            <p>${errorMsg}</p>
            <button onclick="fetchReleases(true)" class="btn btn-primary">Try Again</button>
        </div>
    `;
    container.style.display = 'block';
    lucide.createIcons();
}

// Render feed entries with filters and search
function renderFeed() {
    const container = document.getElementById('feed-container');
    const emptyState = document.getElementById('empty-state');
    container.innerHTML = '';

    let matchedAny = false;

    releaseNotes.forEach(entry => {
        // Filter updates inside this day
        const filteredUpdates = entry.updates.filter(update => {
            // Category check
            const typeLower = update.type.toLowerCase();
            if (currentFilter !== 'all') {
                if (currentFilter === 'issue' && !typeLower.includes('issue') && !typeLower.includes('fix')) return false;
                if (currentFilter === 'feature' && !typeLower.includes('feature')) return false;
                if (currentFilter === 'announcement' && !typeLower.includes('announcement')) return false;
                if (currentFilter === 'deprecated' && !typeLower.includes('deprecat')) return false;
            }

            // Search text check
            if (searchQuery) {
                const typeMatches = update.type.toLowerCase().includes(searchQuery);
                const textMatches = update.text.toLowerCase().includes(searchQuery);
                if (!typeMatches && !textMatches) return false;
            }

            return true;
        });

        // Only render the day card if it has matching updates
        if (filteredUpdates.length > 0) {
            matchedAny = true;
            
            const dayCard = document.createElement('div');
            dayCard.className = 'day-card';
            
            // Build updates html list
            let updatesHtml = '';
            filteredUpdates.forEach(update => {
                const badgeClass = getBadgeClass(update.type);
                
                updatesHtml += `
                    <div class="update-item type-${badgeClass}">
                        <div class="update-meta">
                            <span class="update-badge ${badgeClass}">${update.type}</span>
                            <span class="preview-date" style="font-size: 0.75rem">${entry.date}</span>
                        </div>
                        <div class="update-description">
                            ${update.html}
                        </div>
                        <div class="update-actions">
                            <button class="btn-tweet-trigger" onclick="openTweetComposer('${entry.date}', '${update.type}', ${JSON.stringify(update.text).replace(/"/g, '&quot;')}, '${entry.link}')">
                                <i data-lucide="twitter"></i> Tweet This
                            </button>
                        </div>
                    </div>
                `;
            });

            dayCard.innerHTML = `
                <div class="day-timeline-node">
                    <div class="timeline-dot"></div>
                </div>
                <div class="day-content-card">
                    <div class="day-header">
                        <h2 class="day-title">${entry.date}</h2>
                        <a href="${entry.link}" target="_blank" class="day-link" title="Open official notes">
                            <i data-lucide="external-link"></i>
                        </a>
                    </div>
                    <div class="updates-list">
                        ${updatesHtml}
                    </div>
                </div>
            `;
            
            container.appendChild(dayCard);
        }
    });

    if (matchedAny) {
        container.style.display = 'flex';
        emptyState.style.display = 'none';
    } else {
        container.style.display = 'none';
        emptyState.style.display = 'flex';
    }

    lucide.createIcons();
}

// Map custom update header type to badge colors CSS
function getBadgeClass(type) {
    const t = type.toLowerCase();
    if (t.includes('feature')) return 'feature';
    if (t.includes('announcement')) return 'announcement';
    if (t.includes('issue') || t.includes('fix')) return 'issue';
    if (t.includes('deprecat')) return 'deprecated';
    return 'default';
}

// Open and load the tweet composer drawer
function openTweetComposer(date, type, text, link) {
    const modal = document.getElementById('tweet-modal');
    
    // Fill preview panel
    const previewType = document.getElementById('preview-update-type');
    const previewDate = document.getElementById('preview-update-date');
    const previewBody = document.getElementById('preview-update-body');
    
    previewType.textContent = type;
    previewType.className = `preview-badge ${getBadgeClass(type)}`;
    previewDate.textContent = date;
    previewBody.textContent = text;
    
    // Generate default tweet text
    // Format: BigQuery [Type] (Date): Description text... Link
    // We must limit text length so total is <= 280
    const prefix = `BigQuery [${type}] (${date}): `;
    const suffix = `\n\nDetails: ${link}`;
    const fixedLength = prefix.length + suffix.length;
    const availableLength = 280 - fixedLength;
    
    let draftText = text;
    if (draftText.length > availableLength) {
        draftText = draftText.substring(0, availableLength - 3).trim() + '...';
    }
    
    const finalTweetText = `${prefix}${draftText}${suffix}`;
    
    const tweetTextarea = document.getElementById('tweet-textarea');
    tweetTextarea.value = finalTweetText;
    
    // Update count visualizer
    updateCharCount(finalTweetText);
    
    // Open modal
    modal.classList.add('active');
    
    // Focus textarea
    setTimeout(() => tweetTextarea.focus(), 100);
}

// Update the progress ring and character count text
function updateCharCount(text) {
    const maxChars = 280;
    const count = text.length;
    const remaining = maxChars - count;
    
    const charCounter = document.getElementById('char-count');
    const publishBtn = document.getElementById('publish-tweet-btn');
    
    charCounter.textContent = remaining;
    
    // Progress Ring offset
    const percentage = Math.min(count / maxChars, 1);
    const offset = circumference - (percentage * circumference);
    circle.style.strokeDashoffset = offset;
    
    // Style adjustments based on safety thresholds
    if (remaining < 0) {
        circle.style.stroke = 'var(--color-deprecated)';
        charCounter.className = 'char-count danger';
        publishBtn.disabled = true;
    } else if (remaining <= 20) {
        circle.style.stroke = 'var(--color-issue)';
        charCounter.className = 'char-count warning';
        publishBtn.disabled = false;
    } else {
        circle.style.stroke = 'var(--accent-color)';
        charCounter.className = 'char-count';
        publishBtn.disabled = false;
    }
}
