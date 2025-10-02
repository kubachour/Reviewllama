# Reviewllama 🦙 Chrome Extension

AI-powered App Store Connect review management with automated response generation.

## 🚀 Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked"
4. Select the `Reviewllama` folder
5. The extension is now installed!

## 📋 Features (MVP)

- ✅ **Review Detection & Counting**: Automatically detects and counts reviews on App Store Connect
- ✅ **Unanswered Review Tracking**: Highlights reviews that need responses
- ✅ **Auto-fill Responses**: Automatically fills in response textarea when clicking Reply
- ✅ **Generate Button**: Click to generate AI-powered responses (currently using templates)
- ✅ **Real-time Updates**: Uses MutationObserver to track dynamically loaded reviews
- ✅ **Statistics Display**: Shows total and unanswered review counts

## 🎯 How to Test

1. **Navigate to App Store Connect**:
   - Go to https://appstoreconnect.apple.com
   - Navigate to your app's Ratings & Reviews section:
     - My Apps → [Your App] → App Analytics → Ratings & Reviews

2. **Verify Review Detection**:
   - The extension should automatically detect all reviews on the page
   - Look for the review counter in the page header
   - Check the extension badge for unanswered review count

3. **Test Auto-fill Feature**:
   - Click the "Reply" button on any unanswered review
   - The modal should open with an auto-filled response
   - You should see a "Generate AI Response" button

4. **Test Response Generation**:
   - Click "Generate AI Response" to get a new response
   - The response will update with a different template

5. **Check Extension Popup**:
   - Click the extension icon in Chrome toolbar
   - View statistics and settings
   - Configure API key (for future OpenAI integration)

## 🛠️ Current Structure

```
Reviewllama/
├── manifest.json           # Chrome extension manifest v3
├── background.js           # Service worker for API calls
├── content-script.js       # Main script injected into App Store Connect
├── styles.css              # Styling for injected elements
├── popup.html             # Extension popup interface
├── popup.js               # Popup functionality
├── knowledgebase.json     # Support documentation templates
├── icons/                 # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md              # This file
```

## 🔧 Development

### Debug Mode
The extension runs in debug mode by default. Open Chrome DevTools Console to see debug messages prefixed with `[Reviewllama]`.

### Modifying Selectors
If App Store Connect updates their interface, update the selectors in `content-script.js`:
```javascript
const CONFIG = {
  SELECTORS: {
    reviewContainer: '.review-container',
    reviewTitle: '.review-top h3 span',
    // ... etc
  }
};
```

## 📈 Next Steps

### Phase 2: AI Integration
- [ ] Integrate OpenAI API for real analysis
- [ ] Add sentiment analysis labels
- [ ] Implement category detection
- [ ] Batch process reviews for cost optimization

### Phase 3: Smart Responses
- [ ] Use knowledge base for context-aware responses
- [ ] Multi-language support (Czech/English)
- [ ] Response customization and templates
- [ ] Response history tracking

### Phase 4: Advanced Features
- [ ] Analytics dashboard
- [ ] Team collaboration
- [ ] Automated response policies
- [ ] Integration with helpdesk systems

## 🔑 API Key Configuration

1. Get an OpenAI API key from https://platform.openai.com/api-keys
2. Click the Reviewllama extension icon
3. Enter your API key in the settings
4. Click "Save" and "Test Connection"

**Note**: The API integration is not yet active in the MVP. The extension currently uses template responses.

## 🐛 Troubleshooting

### Extension not detecting reviews
- Make sure you're on the correct page (Ratings & Reviews section)
- Refresh the page
- Check console for error messages

### Auto-fill not working
- The modal needs time to load - the extension waits 500ms
- Check if the modal structure has changed

### Badge not updating
- The badge shows unanswered review count
- It updates when reviews are detected or page changes

## 📝 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions are welcome! Please submit pull requests or open issues for bugs and feature requests.

## 📧 Support

For support, please open an issue on GitHub or contact the development team.

---

**Version**: 1.0.0 (MVP)
**Last Updated**: October 2024