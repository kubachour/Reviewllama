/**
 * Reviewllama Popup Script
 * Handles extension popup settings and statistics
 */

document.addEventListener('DOMContentLoaded', function() {
  // Elements
  const apiKeyInput = document.getElementById('apiKey');
  const saveBtn = document.getElementById('saveBtn');
  const testBtn = document.getElementById('testBtn');
  const statusDiv = document.getElementById('status');
  const totalReviews = document.getElementById('totalReviews');
  const unansweredReviews = document.getElementById('unansweredReviews');
  const autoAnalyzeToggle = document.getElementById('autoAnalyze');
  const autoFillToggle = document.getElementById('autoFill');
  const helpLink = document.getElementById('helpLink');
  const privacyLink = document.getElementById('privacyLink');
  const debugInfo = document.getElementById('debugInfo');

  // Load settings
  loadSettings();
  updateStats();

  // Event listeners
  saveBtn.addEventListener('click', saveSettings);
  testBtn.addEventListener('click', testAPIConnection);
  autoAnalyzeToggle.addEventListener('change', saveSettings);
  autoFillToggle.addEventListener('change', saveSettings);

  helpLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://github.com/kubachour/Reviewllama' });
  });

  privacyLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://github.com/kubachour/Reviewllama' });
  });

  /**
   * Load saved settings
   */
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get([
        'apiKey',
        'autoAnalyze',
        'autoFill'
      ]);

      if (result.apiKey) {
        apiKeyInput.value = result.apiKey;
      }

      autoAnalyzeToggle.checked = result.autoAnalyze !== false;
      autoFillToggle.checked = result.autoFill !== false;

    } catch (error) {
      console.error('Error loading settings:', error);
      showStatus('Error loading settings', 'error');
    }
  }

  /**
   * Save settings
   */
  async function saveSettings() {
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey && apiKeyInput.value) {
      showStatus('Please enter a valid API key', 'error');
      return;
    }

    try {
      await chrome.storage.local.set({
        apiKey: apiKey,
        autoAnalyze: autoAnalyzeToggle.checked,
        autoFill: autoFillToggle.checked
      });

      // Notify background script
      chrome.runtime.sendMessage({
        type: 'SAVE_API_KEY',
        data: { apiKey }
      });

      showStatus('Settings saved successfully!', 'success');

    } catch (error) {
      console.error('Error saving settings:', error);
      showStatus('Error saving settings', 'error');
    }
  }

  /**
   * Test API connection
   */
  async function testAPIConnection() {
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
      showStatus('Please enter an API key first', 'error');
      return;
    }

    testBtn.disabled = true;
    testBtn.textContent = 'Testing...';

    try {
      // Make actual API call to verify key
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        // Check if gpt-4o-mini is available
        const hasGPT4oMini = data.data.some(model => model.id === 'gpt-4o-mini');

        if (hasGPT4oMini) {
          showStatus('✓ API key is valid! GPT-4o-mini available', 'success');
        } else {
          showStatus('✓ API key is valid (but GPT-4o-mini not found)', 'success');
        }
      } else {
        const error = await response.json();
        showStatus(`API Error: ${error.error?.message || 'Invalid API key'}`, 'error');
      }

    } catch (error) {
      console.error('Error testing API:', error);
      showStatus(`Connection test failed: ${error.message}`, 'error');
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = 'Test Connection';
    }
  }

  /**
   * Update statistics
   */
  async function updateStats() {
    try {
      // Get the active tab
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });

      // Display current URL for debugging
      if (tab && tab.url) {
        const shortUrl = tab.url.length > 60 ? tab.url.substring(0, 60) + '...' : tab.url;
        debugInfo.textContent = `Current: ${shortUrl}`;
      }

      // Check if we're on App Store Connect
      if (tab && tab.url && tab.url.includes('appstoreconnect.apple.com')) {
        debugInfo.textContent += '\n✓ On App Store Connect';

        // Request stats from content script
        chrome.tabs.sendMessage(tab.id, {
          type: 'GET_STATS'
        }, (response) => {
          // Check for connection error (content script not loaded)
          if (chrome.runtime.lastError) {
            console.log('Content script not loaded:', chrome.runtime.lastError.message);
            debugInfo.textContent += '\n✗ Content script not loaded';
            debugInfo.textContent += '\n→ Check: Are you on Ratings & Reviews page?';
            totalReviews.textContent = '-';
            unansweredReviews.textContent = '-';
            return;
          }

          debugInfo.textContent += '\n✓ Content script active';
          if (response && response.success) {
            totalReviews.textContent = response.data.total || '0';
            unansweredReviews.textContent = response.data.unanswered || '0';
          } else {
            totalReviews.textContent = '-';
            unansweredReviews.textContent = '-';
          }
        });
      } else {
        // Not on App Store Connect
        debugInfo.textContent += '\n→ Not on App Store Connect';
        totalReviews.textContent = '-';
        unansweredReviews.textContent = '-';
      }

    } catch (error) {
      console.error('Error updating stats:', error);
      debugInfo.textContent = 'Error: ' + error.message;
    }
  }

  /**
   * Show status message
   */
  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';

    // Hide after 3 seconds
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }

  // Update stats periodically
  setInterval(updateStats, 5000);
});