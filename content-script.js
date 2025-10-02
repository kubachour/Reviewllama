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
        debug(`Editable div ${i}:`, div.getAttribute('ng-model'), div.className);
      });
    } else {
      debug('No .modal-dialog found in DOM');
    }

    // Look for the modal contenteditable div (App Store Connect uses this instead of textarea)
    const modalTextarea = document.querySelector('.modal-dialog div[contenteditable="true"]') ||
                         document.querySelector('.modal-dialog div[ng-model="text"]');

    if (modalTextarea) {
      debug('Before fill - innerHTML:', modalTextarea.innerHTML);
      debug('Before fill - visible?', modalTextarea.offsetParent !== null);
      debug('Before fill - ng-show?', modalTextarea.getAttribute('ng-show'));

      // For now, use a dummy response
      const dummyResponse = `Thank you for your review! We appreciate your feedback about "${reviewData.title || 'our app'}". Your ${reviewData.rating}-star rating helps us improve our service.`;

      // Focus the element first to activate Angular's bindings
      modalTextarea.focus();

      // Preserve the inner div structure that Angular expects
      modalTextarea.innerHTML = `<div dir="ltr">${dummyResponse}</div>`;

      debug('After fill - innerHTML:', modalTextarea.innerHTML);

      // Trigger all possible events to ensure Angular detects the change
      modalTextarea.dispatchEvent(new Event('focus', { bubbles: true }));
      modalTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      modalTextarea.dispatchEvent(new Event('change', { bubbles: true }));
      modalTextarea.dispatchEvent(new Event('blur', { bubbles: true }));

      // Try alternative: document.execCommand (works with contenteditable)
      setTimeout(() => {
        modalTextarea.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, dummyResponse);
        debug('Tried execCommand fallback');
      }, 100);

      // Add generate button
      addGenerateButton(modalTextarea, reviewData);

      debug('Auto-filled response in contenteditable div');
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

      // Update contenteditable div or textarea
      if (textarea.hasAttribute('contenteditable')) {
        // Focus and use innerHTML to preserve Angular's inner div structure
        textarea.focus();
        textarea.innerHTML = `<div dir="ltr">${randomResponse}</div>`;

        // Try execCommand as alternative
        setTimeout(() => {
          textarea.focus();
          document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, randomResponse);
        }, 50);
      } else {
        textarea.value = randomResponse;
      }

      // Trigger Angular's change detection
      textarea.dispatchEvent(new Event('focus', { bubbles: true }));
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
      textarea.dispatchEvent(new Event('blur', { bubbles: true }));

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