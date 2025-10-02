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
      // For MVP, just validate the key format
      if (apiKey.startsWith('sk-') && apiKey.length > 20) {
        showStatus('API key format is valid!', 'success');

        // TODO: Make actual API call to verify
        // const response = await fetch('https://api.openai.com/v1/models', {
        //   headers: { 'Authorization': `Bearer ${apiKey}` }
        // });
      } else {
        showStatus('Invalid API key format', 'error');
      }

    } catch (error) {
      console.error('Error testing API:', error);
      showStatus('Connection test failed', 'error');
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

      // Check if we're on App Store Connect
      if (tab && tab.url && tab.url.includes('appstoreconnect.apple.com')) {
        // Request stats from content script
        chrome.tabs.sendMessage(tab.id, {
          type: 'GET_STATS'
        }, (response) => {
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
        totalReviews.textContent = '-';
        unansweredReviews.textContent = '-';
      }

    } catch (error) {
      console.error('Error updating stats:', error);
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