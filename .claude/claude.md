# ReviewCut Chrome Extension instructions

You are an expert Chrome extension developer, proficient in JavaScript/TypeScript, browser extension APIs, and web development.

IMPORTANT INSTRUCTIONS
- Follow the user’s requirements carefully & to the letter.
- First think step-by-step plan written out in great detail.
- Always write correct, best practice, DRY principle (Dont Repeat Yourself), bug free, fully functional and working code 
- do a GitHub commit after each change. Squash commits with the same topic.

Code Style and Structure
- Write clear, modular JavaScript code with proper type definitions
- Follow functional programming patterns; avoid classes
- Use descriptive variable names (e.g., isLoading, hasPermission)
- Structure files logically: popup, background, content scripts, utils
- Implement proper error handling and logging
- Document code with JSDoc comments

Architecture and Best Practices
- Strictly follow Manifest V3 specifications
- Divide responsibilities between background, content scripts and popup
- Configure permissions following the principle of least privilege
- Use modern build tools (webpack/vite) for development
- Implement proper version control and change management

Chrome API Usage
- Use chrome.* APIs correctly (storage, tabs, runtime, etc.)
- Handle asynchronous operations with Promises
- Use Service Worker for background scripts (MV3 requirement)
- Implement chrome.alarms for scheduled tasks
- Use chrome.action API for browser actions
- Handle offline functionality gracefully

Security and Privacy
- Implement Content Security Policy (CSP)
- Handle user data securely
- Prevent XSS and injection attacks
- Use secure messaging between components
- Handle cross-origin requests safely
- Implement secure data encryption
- Follow web_accessible_resources best practices

Performance and Optimization
- Minimize resource usage and avoid memory leaks
- Optimize background script performance
- Implement proper caching mechanisms
- Handle asynchronous operations efficiently
- Monitor and optimize CPU/memory usage

UI and User Experience
- Follow Material Design guidelines
- Implement responsive popup windows
- Provide clear user feedback
- Support keyboard navigation
- Ensure proper loading states
- Add appropriate animations

Accessibility
- Implement ARIA labels
- Ensure sufficient color contrast
- Add keyboard shortcuts

Testing and Debugging
- Use Chrome DevTools effectively
- Write unit and integration tests
- Test cross-browser compatibility
- Monitor performance metrics
- Handle error scenarios

Publishing and Maintenance
- Prepare store listings and screenshots
- Write clear privacy policies
- Implement update mechanisms
- Handle user feedback
- Maintain documentation

Follow Official Documentation
- Refer to Chrome Extension documentation
- Stay updated with Manifest V3 changes
- Follow Chrome Web Store guidelines
- Monitor Chrome platform updates

Output Expectations
- Provide clear, working code examples
- Include necessary error handling
- Follow security best practices
- Ensure cross-browser compatibility
- Write maintainable and scalable code

## Overview
ReviewCut is a Chrome extension designed to streamline App Store Connect review management by providing AI-powered analysis and response generation directly within the App Store Connect interface.

## Core Functionality

### 1. Review Detection & Analysis
- **Automatic Review Counting**: Displays total reviews and unanswered reviews on page load
- **Real-time Monitoring**: Uses MutationObserver to detect dynamically loaded reviews in the Angular SPA
- **Batch Processing**: Sends all visible reviews to OpenAI API in a single request to minimize costs

### 2. Sentiment & Category Labeling
Each review receives visual labels indicating:
- **Sentiment Analysis**:
  - 🟢 Positive (Happy customer)
  - 🟡 Neutral (Mixed feelings)
  - 🔴 Negative (Unhappy customer)

- **Category Classification**:
  - 🐛 Bug Report
  - ✨ Feature Request
  - ❤️ Praise
  - 😤 Complaint
  - ❓ Question
  - 💡 Suggestion

### 3. Response Generation System
When user clicks "Reply" or "Edit Reply":
- **Auto-fill**: Automatically populates the textarea with AI-generated response
- **Generate Button**: Adds "Generate AI Response" button to regenerate if needed
- **Context-Aware**: Uses relevant knowledge base sections based on review category
- **Multi-language**: Detects review language and responds accordingly

## Technical Architecture

### Extension Structure
```
ReviewCut/
├── manifest.json           # Chrome extension manifest v3
├── background.js           # Service worker for API calls
├── content-script.js       # Injected into App Store Connect
├── knowledgebase.json      # Support documentation (600+ entries)
├── styles.css              # Minimal styling for labels
└── icons/                  # Extension icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### Key Technologies
- **Chrome Extension Manifest V3**: Modern extension architecture
- **MutationObserver**: Handles Angular's dynamic content loading
- **OpenAI GPT-3.5-turbo**: Cost-effective AI model for analysis
- **Chrome Storage API**: Stores API keys and temporary data

## Implementation Details

### Phase 1: Basic Functionality (MVP)
1. **Review Detection**
   - Scan page for `.review-container` elements
   - Count total reviews and those without `.dev-response` class
   - Display count in extension badge or injected UI element

2. **Dummy Response**
   - Intercept click on `.reply-link` buttons
   - Auto-fill modal textarea with "Thank you for your review"
   - Proof of concept for extension interaction

### Phase 2: AI Analysis Integration
1. **Batch Review Processing**
   ```javascript
   // Collect all reviews on page
   const reviews = Array.from(document.querySelectorAll('.review-container')).map(el => ({
     title: el.querySelector('[ng-bind="review.value.title"]')?.textContent,
     rating: el.querySelector('.stars')?.className.match(/count-(\d)/)?.[1],
     content: el.querySelector('[ng-bind="review.value.review"]')?.textContent,
     language: detectLanguage(reviewContent) // Auto-detect language
   }));

   // Send batch to OpenAI
   const analysis = await analyzeReviewsBatch(reviews);
   ```

2. **Visual Label Injection**
   - Add colored labels next to each review title
   - Non-intrusive design matching App Store Connect UI
   - Labels update automatically as new reviews load

### Phase 3: Knowledge Base Response Generation
1. **Knowledge Base Structure**
   ```json
   {
     "troubles": [
       {
         "id": "invoice_issue",
         "problem": "I can't find my invoice and I'm a Premium customer",
         "solution": {
           "cs": "Fakturu si můžete snadno stáhnout...",
           "en": "You can easily download your invoice..."
         },
         "categories": ["billing", "premium"],
         "keywords": ["invoice", "bill", "payment", "receipt"]
       }
     ],
     "templates": {
       "bug_acknowledgment": {
         "cs": "Děkujeme za nahlášení tohoto problému...",
         "en": "Thank you for reporting this issue..."
       },
       "feature_request": {
         "cs": "Děkujeme za váš návrh...",
         "en": "Thank you for your suggestion..."
       }
     }
   }
   ```

2. **Response Generation Flow**
   ```
   Review → Category Detection → Knowledge Base Search → Relevant Context Selection → AI Generation → Language Matching → Response
   ```

3. **Context Injection Strategy**
   - Match review keywords with knowledge base entries
   - Select top 3-5 most relevant solutions
   - Send review + relevant context to GPT-3.5-turbo
   - Generate personalized response maintaining brand voice

## API Integration

### OpenAI Configuration
```javascript
const generateResponse = async (review, context) => {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are a helpful customer support agent. Use this context to answer: ${context}`
        },
        {
          role: 'user',
          content: `Generate a response to this review in ${review.language}: ${review.content}`
        }
      ],
      temperature: 0.7,
      max_tokens: 200
    })
  });
  return response.json();
};
```

### Cost Optimization
- **Batch Processing**: Send multiple reviews in one API call
- **Caching**: Store generated responses for similar reviews
- **Token Limits**: Restrict context to relevant KB sections only
- **Model Selection**: Use GPT-3.5-turbo for optimal cost/quality ratio

## User Interface

### Minimal Design Elements
1. **Review Labels**: Small, colored badges (8px border-radius, 12px font)
2. **Generate Button**: Simple text button matching App Store Connect style
3. **Status Indicator**: Subtle loading spinner during AI processing
4. **Error Handling**: Non-intrusive error messages

### Interaction Flow
1. User navigates to App Store Connect reviews page
2. Extension automatically analyzes all visible reviews
3. Labels appear next to each review
4. User clicks "Reply" → Modal opens with AI-generated response
5. User can edit or regenerate response before submitting

## Security & Privacy

### Data Handling
- **No Data Storage**: Reviews not permanently stored
- **API Key Security**: Stored in chrome.storage.local
- **Session-Only Processing**: Data cleared on page navigation
- **HTTPS Only**: All API communications encrypted

### Permissions Required
```json
{
  "host_permissions": [
    "https://appstoreconnect.apple.com/WebObjects/iTunesConnect.woa/*"
  ],
  "permissions": [
    "storage",
    "activeTab"
  ]
}
```

## Development Roadmap

### MVP (Week 1)
- ✅ Basic extension structure
- ✅ Review counting functionality
- ✅ Reply button interception
- ✅ Dummy response insertion

### Phase 2 (Week 2-3)
- ⏳ OpenAI integration
- ⏳ Sentiment analysis labels
- ⏳ Category detection
- ⏳ Batch processing optimization

### Phase 3 (Week 4-5)
- ⏳ Knowledge base integration
- ⏳ Multi-language support
- ⏳ Response customization
- ⏳ Context-aware generation

### Future Enhancements
- 📋 Response history tracking
- 📋 Analytics dashboard
- 📋 Custom template editor
- 📋 Team collaboration features
- 📋 Automated response policies
- 📋 Integration with helpdesk systems

## Cost Analysis

### Estimated OpenAI API Costs
- **Per Review Analysis**: ~100 tokens ≈ $0.00015
- **Per Response Generation**: ~300 tokens ≈ $0.00045
- **Batch of 20 reviews**: ~$0.012
- **Monthly (1000 reviews)**: ~$0.60

### Optimization Strategies
1. Cache similar review analyses
2. Batch process all visible reviews
3. Use embeddings for KB search (future)
4. Implement rate limiting
5. Store frequent response templates

## Testing Strategy

### Test Scenarios
1. **Page Load**: Verify review detection on initial load
2. **Dynamic Loading**: Test with infinite scroll
3. **Language Detection**: Test Czech, English, other languages
4. **Modal Interaction**: Verify response insertion
5. **Edge Cases**: Empty reviews, special characters, long texts

### Browser Compatibility
- Chrome 96+ (primary target)
- Edge 96+ (Chromium-based)
- Other Chromium browsers (Opera, Brave)

## Installation Instructions

1. **Development Setup**:
   ```bash
   git clone [repository]
   cd ReviewCut
   # Add your OpenAI API key to config
   ```

2. **Load Extension**:
   - Open Chrome → Extensions → Developer mode ON
   - Click "Load unpacked" → Select ReviewCut folder

3. **Configuration**:
   - Navigate to App Store Connect
   - Extension activates automatically
   - Enter API key when prompted (first use)

## Support & Maintenance

### Error Handling
- Network failures: Retry with exponential backoff
- API limits: Queue and throttle requests
- DOM changes: Update selectors quarterly
- Angular updates: Monitor for breaking changes

### Monitoring
- Track API usage via OpenAI dashboard
- Log errors to chrome.storage.local
- Version checking for App Store Connect changes

## Conclusion

ReviewCut streamlines App Store review management by combining AI analysis with contextual knowledge base responses, saving developers hours of manual work while maintaining personalized, high-quality customer interactions.