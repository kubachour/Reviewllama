/**
 * Reviewllama Content Script
 * Handles review detection, counting, and UI injection for App Store Connect
 */

(function() {
  'use strict';

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
      const title = element.querySelector(CONFIG.SELECTORS.reviewTitle)?.textContent?.trim() || '';
      const ratingElement = element.querySelector(CONFIG.SELECTORS.reviewRating);
      const ratingMatch = ratingElement?.className?.match(/count-(\d)/);
      const rating = ratingMatch ? parseInt(ratingMatch[1]) : 0;

      // Get review content - it's the direct text node after review-meta
      const reviewMeta = element.querySelector('.review-meta');
      const reviewContentNode = reviewMeta?.nextSibling;
      const reviewContent = reviewContentNode?.textContent?.trim() || '';

      const hasResponse = !!element.querySelector(CONFIG.SELECTORS.devResponse);
      const nickname = element.querySelector('.review-meta span')?.textContent?.match(/by (.+?) on/)?.[1] || '';

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
    const reviewElements = document.querySelectorAll(CONFIG.SELECTORS.reviewContainer);

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
   * Auto-fill response in modal textarea
   */
  function autoFillResponse(reviewData) {
    // Look for the modal textarea
    const modalTextarea = document.querySelector('.modal-dialog textarea[ng-model="modalData.response"]');

    if (modalTextarea) {
      // For now, use a dummy response
      const dummyResponse = `Thank you for your review! We appreciate your feedback about "${reviewData.title || 'our app'}". Your ${reviewData.rating}-star rating helps us improve our service.`;

      // Set the value
      modalTextarea.value = dummyResponse;

      // Trigger Angular's change detection
      const event = new Event('input', { bubbles: true });
      modalTextarea.dispatchEvent(event);

      // Add generate button
      addGenerateButton(modalTextarea, reviewData);

      debug('Auto-filled response');
    } else {
      debug('Modal textarea not found, retrying...');
      // Retry after a short delay
      setTimeout(() => {
        const retry = document.querySelector('.modal-dialog textarea[ng-model="modalData.response"]');
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
   * Generate AI response (placeholder for now)
   */
  function generateAIResponse(reviewData, textarea) {
    debug('Generating AI response for:', reviewData);

    // Show loading state
    const btn = document.getElementById('reviewllama-generate-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Generating...';
    btn.disabled = true;

    // Simulate API call with timeout
    setTimeout(() => {
      // Generate a slightly more personalized dummy response
      const responses = [
        `Thank you for taking the time to share your feedback, ${reviewData.nickname}! We're glad you're using our app.`,
        `We appreciate your ${reviewData.rating}-star review! Your feedback about "${reviewData.title || 'the app'}" is valuable to us.`,
        `Thanks for your review! We're constantly working to improve the app based on feedback like yours.`,
        `Hi ${reviewData.nickname}, thank you for your feedback! We take all reviews seriously and use them to make our app better.`
      ];

      const randomResponse = responses[Math.floor(Math.random() * responses.length)];

      // Update textarea
      textarea.value = randomResponse;
      const event = new Event('input', { bubbles: true });
      textarea.dispatchEvent(event);

      // Reset button
      btn.textContent = originalText;
      btn.disabled = false;
    }, 1000);
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
    const checkInterval = setInterval(() => {
      if (document.querySelector(CONFIG.SELECTORS.reviewContainer) ||
          document.querySelector('#reviews-container')) {
        clearInterval(checkInterval);
        initialize();
      }
    }, 500);

    // Stop checking after 30 seconds
    setTimeout(() => clearInterval(checkInterval), 30000);
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForReviews);
  } else {
    waitForReviews();
  }

  debug('Content script loaded');
})();