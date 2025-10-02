/**
 * Reviewllama Background Service Worker
 * Handles API calls, storage, and badge updates
 */

// State management
let extensionState = {
  apiKey: null,
  reviews: {},
  isProcessing: false
};

/**
 * Initialize the extension
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log('Reviewllama extension installed');

  // Set default badge
  chrome.action.setBadgeBackgroundColor({ color: '#007AFF' });
  chrome.action.setBadgeText({ text: '' });

  // Load saved API key
  loadApiKey();
});

/**
 * Load API key from storage
 */
async function loadApiKey() {
  try {
    const result = await chrome.storage.local.get(['apiKey']);
    if (result.apiKey) {
      extensionState.apiKey = result.apiKey;
      console.log('API key loaded');
    }
  } catch (error) {
    console.error('Error loading API key:', error);
  }
}

/**
 * Save API key to storage
 */
async function saveApiKey(apiKey) {
  try {
    await chrome.storage.local.set({ apiKey });
    extensionState.apiKey = apiKey;
    console.log('API key saved');
  } catch (error) {
    console.error('Error saving API key:', error);
  }
}

/**
 * Handle messages from content script
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request.type);

  switch (request.type) {
    case 'UPDATE_BADGE':
      handleBadgeUpdate(request.data, sender.tab?.id);
      sendResponse({ success: true });
      break;

    case 'SAVE_API_KEY':
      saveApiKey(request.data.apiKey);
      sendResponse({ success: true });
      break;

    case 'GET_API_KEY':
      sendResponse({ apiKey: extensionState.apiKey });
      break;

    case 'ANALYZE_REVIEWS':
      handleReviewAnalysis(request.data)
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep channel open for async response
      break;

    case 'GENERATE_RESPONSE':
      handleResponseGeneration(request.data)
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep channel open for async response
      break;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }

  return false;
});

/**
 * Update extension badge with review count
 */
function handleBadgeUpdate(data, tabId) {
  const { unanswered } = data;

  if (unanswered > 0) {
    // Show unanswered count
    chrome.action.setBadgeText({
      text: String(unanswered),
      tabId: tabId
    });
    chrome.action.setBadgeBackgroundColor({
      color: '#FF3B30',
      tabId: tabId
    });
  } else {
    // Clear badge if no unanswered reviews
    chrome.action.setBadgeText({
      text: '',
      tabId: tabId
    });
  }
}

/**
 * Handle review analysis with OpenAI
 */
async function handleReviewAnalysis(reviews) {
  if (!extensionState.apiKey) {
    throw new Error('API key not configured');
  }

  if (extensionState.isProcessing) {
    throw new Error('Analysis already in progress');
  }

  extensionState.isProcessing = true;

  try {
    // Prepare reviews for batch analysis
    const reviewsForAnalysis = reviews.map(review => ({
      id: review.id,
      title: review.title,
      rating: review.rating,
      content: review.content
    }));

    // For MVP, return mock analysis
    // TODO: Integrate with OpenAI API
    const mockAnalysis = reviewsForAnalysis.map(review => {
      // Simple sentiment based on rating
      let sentiment = 'neutral';
      if (review.rating >= 4) sentiment = 'positive';
      else if (review.rating <= 2) sentiment = 'negative';

      // Simple category detection based on keywords
      let category = 'general';
      const content = (review.title + ' ' + review.content).toLowerCase();

      if (content.includes('bug') || content.includes('crash') || content.includes('error')) {
        category = 'bug';
      } else if (content.includes('feature') || content.includes('add') || content.includes('want')) {
        category = 'feature';
      } else if (content.includes('love') || content.includes('great') || content.includes('excellent')) {
        category = 'praise';
      } else if (content.includes('hate') || content.includes('terrible') || content.includes('awful')) {
        category = 'complaint';
      } else if (content.includes('?') || content.includes('how')) {
        category = 'question';
      } else if (content.includes('should') || content.includes('could')) {
        category = 'suggestion';
      }

      return {
        id: review.id,
        sentiment,
        category,
        language: detectLanguage(review.content)
      };
    });

    // Cache analysis results
    mockAnalysis.forEach(analysis => {
      extensionState.reviews[analysis.id] = analysis;
    });

    return mockAnalysis;

  } finally {
    extensionState.isProcessing = false;
  }
}

/**
 * Handle response generation with OpenAI
 */
async function handleResponseGeneration(data) {
  const { review, context } = data;

  if (!extensionState.apiKey) {
    throw new Error('API key not configured');
  }

  try {
    // For MVP, return enhanced dummy responses
    // TODO: Integrate with OpenAI API
    const templates = {
      positive: [
        `Thank you so much for your wonderful ${review.rating}-star review! We're thrilled to hear that you're enjoying the app.`,
        `We're delighted by your positive feedback! Your ${review.rating}-star rating motivates our team to keep improving.`,
        `Thank you for taking the time to share your experience! We're so happy you love the app.`
      ],
      negative: [
        `Thank you for your feedback. We're sorry to hear about your experience and take your concerns seriously.`,
        `We apologize for the issues you've encountered. Your feedback helps us identify areas for improvement.`,
        `Thank you for bringing this to our attention. We're working hard to address these concerns.`
      ],
      neutral: [
        `Thank you for your ${review.rating}-star review and honest feedback. We value your input.`,
        `We appreciate you taking the time to share your thoughts about the app.`,
        `Thanks for your review! Your feedback helps us understand how we can better serve our users.`
      ],
      bug: [
        `Thank you for reporting this issue. Our development team is investigating the problem you described.`,
        `We apologize for the technical difficulties. We're working on a fix for this bug.`,
        `Thanks for the detailed bug report. We'll address this in our next update.`
      ],
      feature: [
        `Thanks for the feature suggestion! We'll share this with our product team for consideration.`,
        `Great idea! We're always looking for ways to enhance the app based on user feedback.`,
        `We appreciate your feature request and will consider it for future updates.`
      ]
    };

    // Get cached analysis or do simple analysis
    const analysis = extensionState.reviews[review.id] || {
      sentiment: review.rating >= 4 ? 'positive' : review.rating <= 2 ? 'negative' : 'neutral',
      category: 'general'
    };

    // Select appropriate template
    let responseTemplates = templates[analysis.category] || templates[analysis.sentiment] || templates.neutral;
    let response = responseTemplates[Math.floor(Math.random() * responseTemplates.length)];

    // Add personalization
    if (review.nickname) {
      response = `Hi ${review.nickname}, ${response.charAt(0).toLowerCase()}${response.slice(1)}`;
    }

    // Add specific acknowledgment
    if (review.title) {
      response += ` We noted your comment about "${review.title}".`;
    }

    // Add closing based on sentiment
    if (analysis.sentiment === 'positive') {
      response += ' Thank you for being a valued user!';
    } else if (analysis.sentiment === 'negative') {
      response += ' We hope to improve your experience with future updates.';
    } else {
      response += ' Your input is valuable to us.';
    }

    return {
      response,
      analysis,
      generated: true
    };

  } catch (error) {
    console.error('Error generating response:', error);
    throw error;
  }
}

/**
 * Simple language detection
 */
function detectLanguage(text) {
  // Basic language detection based on common words
  const czechWords = ['je', 'na', 'že', 'ale', 'když', 'jak', 'nebo', 'který'];
  const lowerText = text.toLowerCase();

  let czechCount = 0;
  czechWords.forEach(word => {
    if (lowerText.includes(` ${word} `)) czechCount++;
  });

  return czechCount >= 2 ? 'cs' : 'en';
}

/**
 * Handle extension icon click (open popup)
 */
chrome.action.onClicked.addListener((tab) => {
  // The popup will handle this if defined in manifest
  // Otherwise, we could inject a UI directly
  console.log('Extension icon clicked on tab:', tab.id);
});

/**
 * Clean up on tab close
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  // Clear badge for closed tabs
  chrome.action.setBadgeText({ text: '', tabId: tabId }).catch(() => {
    // Tab might already be closed, ignore error
  });
});

console.log('ReviewCut background service worker loaded');