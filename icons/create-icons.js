// Node.js script to create placeholder PNG icons
const fs = require('fs');

// Base64 encoded 1x1 blue pixel PNG as placeholder
const placeholderPNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// Create placeholder icons
['icon16.png', 'icon48.png', 'icon128.png'].forEach(filename => {
    fs.writeFileSync(filename, Buffer.from(placeholderPNG, 'base64'));
    console.log(`Created ${filename}`);
});

console.log('Placeholder icons created. Replace with proper icons using generate-icons.html');