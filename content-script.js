/**
 * Reviewllama Content Script
 * Handles review detection, counting, and UI injection for App Store Connect
 */

(function() {
  'use strict';

  // Log script load immediately
  console.log('[Reviewllama] Content script loaded!');
  console.log('[Reviewllama] Current URL:', window.location.href);
  console.log('[Reviewllama] Page title:', document.title);

  // Configuration
  const CONFIG = {
    DEBUG: true,
    SELECTORS: {
      reviewContainer: '.review-container',
      reviewTitle: '.review-top h3 span',
      reviewRating: '.stars',
      reviewContent: '.review-container > div:not(.review-top):not(.review-meta):not(.inner-container)',
      replyLink: '.reply-link',
      editLink: '.edit-link',
      devResponse: '.inner-container',
      infiniteScroll: '#infinite-scroll',
      reviewsHeader: '#reviews-header',
      totalReviewsSpan: '#total-reviews'
    }
  };

  // State management
  let state = {
    reviews: new Map(),
    totalReviews: 0,
    unansweredReviews: 0,
    isProcessing: false,
    observer: null
  };

  /**
   * Log debug messages
   */
  function debug(...args) {
    if (CONFIG.DEBUG) {
      console.log('[Reviewllama]', ...args);
    }
  }

  /**
   * Extract review data from DOM element
   */
  function extractReviewData(element) {
    try {
      // Flexible title selector - works in both main page and modal
      const title = element.querySelector(CONFIG.SELECTORS.reviewTitle)?.textContent?.trim() ||
                    element.querySelector('div[ng-bind*=".value.title"]')?.textContent?.trim() ||
                    element.querySelector('span[ng-bind*=".value.title"]')?.textContent?.trim() || '';

      const ratingElement = element.querySelector(CONFIG.SELECTORS.reviewRating);
      const ratingMatch = ratingElement?.className?.match(/count-(\d)/);
      const rating = ratingMatch ? parseInt(ratingMatch[1]) : 0;

      // Flexible review content selector - works with review.value.review, currentReview.value.review, or class
      const reviewContent = element.querySelector('div[ng-bind*=".value.review"]')?.textContent?.trim() ||
                           element.querySelector('.review-body')?.textContent?.trim() || '';

      const hasResponse = !!element.querySelector(CONFIG.SELECTORS.devResponse);

      // Get nickname - parse from "by Username – Date" format
      const nicknameText = element.querySelector('.review-meta span')?.textContent || '';
      const nicknameMatch = nicknameText.match(/by (.+?) –/);
      const nickname = nicknameMatch ? nicknameMatch[1] : '';

      debug('Extracted review:', { title, rating, content: reviewContent.substring(0, 50), nickname, hasResponse });

      // Generate unique ID based on content
      const id = btoa(encodeURIComponent(title + nickname + reviewContent)).substring(0, 16);

      return {
        id,
        title,
        rating,
        content: reviewContent,
        nickname,
        hasResponse,
        element
      };
    } catch (error) {
      debug('Error extracting review data:', error);
      return null;
    }
  }

  /**
   * Scan page for reviews and count them
   */
  function scanReviews() {
    debug('Starting scanReviews()...');
    const reviewElements = document.querySelectorAll(CONFIG.SELECTORS.reviewContainer);
    debug(`Found ${reviewElements.length} elements matching ${CONFIG.SELECTORS.reviewContainer}`);

    state.reviews.clear();
    state.totalReviews = 0;
    state.unansweredReviews = 0;

    reviewElements.forEach(element => {
      const reviewData = extractReviewData(element);
      if (reviewData) {
        state.reviews.set(reviewData.id, reviewData);
        state.totalReviews++;
        if (!reviewData.hasResponse) {
          state.unansweredReviews++;
        }
      }
    });

    debug(`Found ${state.totalReviews} reviews (${state.unansweredReviews} unanswered)`);
    updateUI();

    // Trigger batch analysis if we have reviews
    if (state.totalReviews > 0) {
      analyzeAllReviews();
    }
  }

  /**
   * Update UI with review counts
   */
  function updateUI() {
    // Update extension badge
    chrome.runtime.sendMessage({
      type: 'UPDATE_BADGE',
      data: {
        total: state.totalReviews,
        unanswered: state.unansweredReviews
      }
    }).catch(err => debug('Error updating badge:', err));

    // Inject review counter into page header
    injectReviewCounter();
  }

  /**
   * Inject review counter into page header
   */
  function injectReviewCounter() {
    const existingCounter = document.getElementById('reviewllama-counter');
    if (existingCounter) {
      existingCounter.remove();
    }

    const reviewsHeader = document.querySelector(CONFIG.SELECTORS.reviewsHeader);
    if (!reviewsHeader) {
      debug('Reviews header not found');
      return;
    }

    const counterDiv = document.createElement('div');
    counterDiv.id = 'reviewllama-counter';
    counterDiv.className = 'reviewllama-counter';
    counterDiv.innerHTML = `
      <div class="reviewllama-stats">
        <span class="reviewllama-stat">
          <span class="reviewllama-label">Total:</span>
          <span class="reviewllama-value">${state.totalReviews}</span>
        </span>
        <span class="reviewllama-stat reviewllama-unanswered">
          <span class="reviewllama-label">Unanswered:</span>
          <span class="reviewllama-value">${state.unansweredReviews}</span>
        </span>
      </div>
    `;

    // Insert before the first dropdown menu
    const firstMenu = reviewsHeader.querySelector('.hasPopOver');
    if (firstMenu) {
      reviewsHeader.insertBefore(counterDiv, firstMenu);
    } else {
      reviewsHeader.appendChild(counterDiv);
    }
  }

  /**
   * Analyze all reviews with OpenAI batch API
   */
  async function analyzeAllReviews() {
    debug('Starting batch analysis...');

    // Check cache first
    const cacheKey = `analysis_cache_${window.location.pathname}`;
    const cached = await chrome.storage.local.get(cacheKey);

    if (cached[cacheKey] && Date.now() - cached[cacheKey].timestamp < 24 * 60 * 60 * 1000) {
      debug('Using cached analysis');
      applyAnalysisResults(cached[cacheKey].data);
      return;
    }

    // Prepare reviews array
    const reviews = Array.from(state.reviews.values());

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'BATCH_ANALYZE_REVIEWS',
        data: reviews
      });

      if (response.success) {
        debug('Batch analysis successful');

        // Cache results
        await chrome.storage.local.set({
          [cacheKey]: {
            timestamp: Date.now(),
            data: response.data
          }
        });

        applyAnalysisResults(response.data);
      } else {
        debug('Batch analysis failed:', response.error);
      }
    } catch (error) {
      debug('Error in batch analysis:', error);
    }
  }

  /**
   * Apply analysis results to reviews and inject labels
   */
  function applyAnalysisResults(analysisData) {
    if (!analysisData || !analysisData.reviews) {
      debug('Invalid analysis data');
      return;
    }

    debug('Applying analysis results:', analysisData.reviews.length, 'items');
    debug('Current reviews in state:', state.reviews.size);

    let matchedCount = 0;

    // Update state with analysis
    analysisData.reviews.forEach(analysis => {
      const review = state.reviews.get(analysis.id);
      if (review) {
        review.analysis = {
          sentiment: analysis.sentiment,
          category: analysis.category,
          language: analysis.language,
          topics: analysis.topics || []
        };
        state.reviews.set(analysis.id, review);
        matchedCount++;
        debug(`Matched analysis for review ${analysis.id}: ${analysis.sentiment}/${analysis.category}`);
      } else {
        debug(`No review found for analysis ID: ${analysis.id}`);
      }
    });

    debug(`Analysis applied: ${matchedCount} matched out of ${analysisData.reviews.length}`);

    // Inject visual labels
    injectReviewLabels();
  }

  /**
   * Inject sentiment and category labels into review UI
   */
  function injectReviewLabels() {
    debug('Starting label injection...');
    let injectedCount = 0;
    let skippedCount = 0;

    state.reviews.forEach(review => {
      if (!review.analysis) {
        debug('Review has no analysis:', review.id);
        skippedCount++;
        return;
      }

      if (!review.element) {
        debug('Review has no element:', review.id);
        skippedCount++;
        return;
      }

      // Check if labels already exist
      if (review.element.querySelector('.reviewllama-labels')) {
        skippedCount++;
        return;
      }

      const { sentiment, category } = review.analysis;

      debug(`Injecting labels for review ${review.id}: ${sentiment} / ${category}`);

      // Create labels container
      const labelsDiv = document.createElement('div');
      labelsDiv.className = 'reviewllama-labels';

      // Sentiment label
      const sentimentEmoji = {
        positive: '🟢',
        negative: '🔴',
        neutral: '🟡'
      }[sentiment] || '⚪';

      // Category label
      const categoryEmoji = {
        bug: '🐛',
        feature: '✨',
        praise: '❤️',
        complaint: '😤',
        question: '❓',
        suggestion: '💡'
      }[category] || '📝';

      labelsDiv.innerHTML = `
        <span class="reviewllama-badge reviewllama-sentiment-badge reviewllama-sentiment-${sentiment}">
          <span class="reviewllama-emoji">${sentimentEmoji}</span>
          <span class="reviewllama-text">${sentiment.charAt(0).toUpperCase() + sentiment.slice(1)}</span>
        </span>
        <span class="reviewllama-badge reviewllama-category-badge reviewllama-category-${category}">
          <span class="reviewllama-emoji">${categoryEmoji}</span>
          <span class="reviewllama-text">${category.charAt(0).toUpperCase() + category.slice(1)}</span>
        </span>
      `;

      // Insert BEFORE review-top (as separate prominent row)
      const reviewTop = review.element.querySelector('.review-top');
      if (reviewTop) {
        review.element.insertBefore(labelsDiv, reviewTop);
        injectedCount++;
        debug('Label injected successfully for:', review.id);
      } else {
        debug('Could not find .review-top for:', review.id);
      }
    });

    debug(`Review labels injected: ${injectedCount} injected, ${skippedCount} skipped`);
  }

  /**
   * Match review against knowledge base (client-side)
   */
  function matchKnowledgeBase(review) {
    return new Promise(async (resolve) => {
      try {
        // Load knowledge base
        const response = await fetch(chrome.runtime.getURL('knowledgebase.json'));
        const kb = await response.json();

        const reviewText = (review.title + ' ' + review.content).toLowerCase();
        const scores = [];

        // Score each trouble item
        kb.troubles.forEach(item => {
          let score = 0;
          item.keywords.forEach(keyword => {
            if (reviewText.includes(keyword.toLowerCase())) {
              score++;
            }
          });

          if (score > 0) {
            scores.push({ id: item.id, score, item });
          }
        });

        // Return top 3 matches
        const matches = scores
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);

        resolve(matches);
      } catch (error) {
        debug('Error matching KB:', error);
        resolve([]);
      }
    });
  }

  /**
   * Intercept reply button clicks
   */
  function interceptReplyButtons() {
    document.addEventListener('click', function(event) {
      const target = event.target;

      // Check if clicked element is a reply or edit link
      if (target.matches(CONFIG.SELECTORS.replyLink) ||
          target.matches(CONFIG.SELECTORS.editLink)) {

        debug('Reply/Edit button clicked');

        // Find the parent review container
        const reviewContainer = target.closest(CONFIG.SELECTORS.reviewContainer);
        if (reviewContainer) {
          const reviewData = extractReviewData(reviewContainer);
          if (reviewData) {
            debug('Review data:', reviewData);

            // Wait for modal to appear, then auto-fill
            setTimeout(() => autoFillResponse(reviewData), 500);
          }
        }
      }
    }, true);
  }

  /**
   * Auto-fill response in modal (uses contenteditable div, not textarea)
   */
  function autoFillResponse(reviewData) {
    // Log modal structure for debugging
    const modal = document.querySelector('.modal-dialog');
    if (modal) {
      debug('Modal found!');
      const editableDivs = modal.querySelectorAll('div[contenteditable="true"]');
      debug(`Found ${editableDivs.length} contenteditable divs in modal`);
      editableDivs.forEach((div, i) => {
        debug(`Editable div ${i}:`, div.getAttribute('ng-model'), div.className, 'visible:', div.offsetParent !== null);
      });
    } else {
      debug('No .modal-dialog found in DOM');
    }

    // Find the VISIBLE contenteditable div (there are 2 - one disabled, one active)
    const allEditableDivs = document.querySelectorAll('.modal-dialog div[contenteditable="true"]');
    let modalTextarea = null;

    // Find the visible one
    for (const div of allEditableDivs) {
      if (div.offsetParent !== null) {
        modalTextarea = div;
        debug('Found visible contenteditable div');
        break;
      }
    }

    // Fallback to first one if none are visible yet
    if (!modalTextarea && allEditableDivs.length > 0) {
      modalTextarea = allEditableDivs[allEditableDivs.length - 1]; // Try last one
      debug('No visible div found, using last contenteditable div');
    }

    if (modalTextarea) {
      debug('Before fill - innerHTML:', modalTextarea.innerHTML);
      debug('Before fill - visible?', modalTextarea.offsetParent !== null);
      debug('Before fill - ng-show?', modalTextarea.getAttribute('ng-show'));

      // Add generate button first
      addGenerateButton(modalTextarea, reviewData);

      // Use cached response if available, otherwise generate new one
      if (reviewData.generatedResponse) {
        debug('Using cached AI response');
        insertTextIntoModal(modalTextarea, reviewData.generatedResponse);
      } else {
        // Auto-generate on open (this will call the AI API)
        debug('Auto-generating AI response...');
        setTimeout(() => {
          generateAIResponse(reviewData, modalTextarea);
        }, 300);
      }

      debug('Auto-fill initiated');
    } else {
      debug('Modal contenteditable div not found, retrying...');
      // Retry after a short delay
      setTimeout(() => {
        const retry = document.querySelector('.modal-dialog div[contenteditable="true"]');
        if (retry) {
          autoFillResponse(reviewData);
        }
      }, 200);
    }
  }

  /**
   * Add generate AI response button to modal
   */
  function addGenerateButton(textarea, reviewData) {
    // Check if button already exists
    if (document.getElementById('reviewllama-generate-btn')) {
      return;
    }

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'reviewllama-generate-container';
    buttonContainer.innerHTML = `
      <button id="reviewllama-generate-btn" class="reviewllama-generate-btn">
        Generate AI Response
      </button>
    `;

    // Insert after textarea
    textarea.parentElement.appendChild(buttonContainer);

    // Add click handler
    document.getElementById('reviewllama-generate-btn').addEventListener('click', function(e) {
      e.preventDefault();
      generateAIResponse(reviewData, textarea);
    });
  }

  /**
   * Generate AI response with real OpenAI API
   */
  async function generateAIResponse(reviewData, textarea) {
    debug('Generating AI response for:', reviewData);

    // Show loading state
    const btn = document.getElementById('reviewllama-generate-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Generating...';
    btn.disabled = true;

    try {
      // Match review against knowledge base
      const matchedKBItems = await matchKnowledgeBase(reviewData);
      debug('Matched KB items:', matchedKBItems);

      // Call background script for AI generation
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_AI_RESPONSE',
        data: {
          review: reviewData,
          matchedKBItems: matchedKBItems
        }
      });

      if (response.success) {
        const generatedResponse = response.data.response;
        debug('AI response received:', generatedResponse.substring(0, 50) + '...');

        // Insert response into textarea
        insertTextIntoModal(textarea, generatedResponse);

        // Cache the response
        reviewData.generatedResponse = generatedResponse;
        state.reviews.set(reviewData.id, reviewData);
      } else {
        debug('AI generation failed:', response.error);
        alert(`Error generating response: ${response.error}`);
      }
    } catch (error) {
      debug('Error in AI generation:', error);
      alert(`Error: ${error.message}`);
    } finally {
      // Reset button
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }

  /**
   * Insert text into modal contenteditable or textarea
   */
  function insertTextIntoModal(element, text) {
    if (element.hasAttribute('contenteditable')) {
      // Click and focus the element
      element.click();
      element.focus();

      // Select all and delete
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);

      // Insert text character by character
      for (let char of text) {
        document.execCommand('insertText', false, char);
      }

      // Trigger Angular's change detection
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));
    } else {
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  /**
   * Set up MutationObserver for dynamic content
   */
  function setupObserver() {
    if (state.observer) {
      state.observer.disconnect();
    }

    const targetNode = document.querySelector(CONFIG.SELECTORS.infiniteScroll) ||
                      document.querySelector('#reviews-container') ||
                      document.body;

    state.observer = new MutationObserver((mutations) => {
      // Debounce rapid mutations
      if (state.isProcessing) return;

      state.isProcessing = true;
      setTimeout(() => {
        state.isProcessing = false;

        // Check if new reviews were added
        const hasNewReviews = mutations.some(mutation => {
          return Array.from(mutation.addedNodes).some(node => {
            return node.nodeType === 1 &&
                   (node.matches?.(CONFIG.SELECTORS.reviewContainer) ||
                    node.querySelector?.(CONFIG.SELECTORS.reviewContainer));
          });
        });

        if (hasNewReviews) {
          debug('New reviews detected');
          scanReviews();
        }
      }, 500);
    });

    state.observer.observe(targetNode, {
      childList: true,
      subtree: true
    });

    debug('MutationObserver set up');
  }

  /**
   * Handle messages from popup
   */
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'GET_STATS') {
      sendResponse({
        success: true,
        data: {
          total: state.totalReviews,
          unanswered: state.unansweredReviews
        }
      });
    }
    return false;
  });

  /**
   * Initialize the extension
   */
  function initialize() {
    debug('Initializing Reviewllama extension');

    // Initial scan
    scanReviews();

    // Set up observers and interceptors
    setupObserver();
    interceptReplyButtons();

    // Re-scan periodically to catch any missed updates
    setInterval(() => {
      const currentCount = document.querySelectorAll(CONFIG.SELECTORS.reviewContainer).length;
      if (currentCount !== state.totalReviews) {
        debug('Review count mismatch, rescanning...');
        scanReviews();
      }
    }, 5000);
  }

  /**
   * Wait for page to be ready
   */
  function waitForReviews() {
    debug('waitForReviews() started - checking every 500ms...');
    let attempts = 0;

    const checkInterval = setInterval(() => {
      attempts++;
      const reviewContainer = document.querySelector(CONFIG.SELECTORS.reviewContainer);
      const reviewsDiv = document.querySelector('#reviews-container');

      debug(`Attempt ${attempts}: reviewContainer=${!!reviewContainer}, reviewsDiv=${!!reviewsDiv}`);

      if (reviewContainer || reviewsDiv) {
        debug('Found reviews! Initializing...');
        clearInterval(checkInterval);
        initialize();
      }
    }, 500);

    // Stop checking after 30 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      debug(`Stopped checking after ${attempts} attempts (30 seconds)`);
    }, 30000);
  }

  // Start when DOM is ready
  debug(`Document readyState: ${document.readyState}`);
  if (document.readyState === 'loading') {
    debug('Waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', () => {
      debug('DOMContentLoaded fired!');
      waitForReviews();
    });
  } else {
    debug('DOM already ready, starting immediately...');
    waitForReviews();
  }

  debug('Content script initialization complete');
})();