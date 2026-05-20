#!/usr/bin/env node

/**
 * PWA Icon Generation Script
 * Creates placeholder icons for PWA installation
 * 
 * These are PRODUCTION PLACEHOLDER icons.
 * For actual deployment, replace with proper design:
 * - Use graphic designer or tool like Figma/Adobe XD
 * - 192x192: app icon on home screen
 * - 512x512: splash screen and app listings
 * - Maskable variants: for icon masks on Android 12+
 * 
 * Tool: https://www.favicon-generator.org/ or similar
 */

const fs = require('fs');
const path = require('path');

// Create SVG-based PNG generator function
function generateSVGIcon(size, isMaskable = false) {
  const sizeStr = `${size}x${size}`;
  
  // Healthcare-themed SVG
  const bgColor = isMaskable ? '#0f172a' : '#0f172a';
  const iconColor = '#ffffff';
  
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="${size}" height="${size}" fill="${bgColor}"/>
  
  <!-- Stethoscope Icon -->
  <g transform="translate(${size * 0.2}, ${size * 0.2}) scale(${(size * 0.6) / 100})">
    <!-- Stethoscope -->
    <circle cx="50" cy="30" r="12" fill="none" stroke="${iconColor}" stroke-width="4"/>
    <circle cx="50" cy="30" r="8" fill="none" stroke="${iconColor}" stroke-width="2"/>
    <path d="M 40 38 Q 35 50 30 60 Q 28 65 25 65" fill="none" stroke="${iconColor}" stroke-width="4" stroke-linecap="round"/>
    <path d="M 60 38 Q 65 50 70 60 Q 72 65 75 65" fill="none" stroke="${iconColor}" stroke-width="4" stroke-linecap="round"/>
    <circle cx="25" cy="65" r="5" fill="${iconColor}"/>
    <circle cx="75" cy="65" r="5" fill="${iconColor}"/>
  </g>
  
  <!-- Sakhi Text Badge (bottom) -->
  <text x="${size / 2}" y="${size - 8}" font-family="Arial, sans-serif" font-size="${size * 0.08}" font-weight="bold" fill="${iconColor}" text-anchor="middle">SAKHI</text>
</svg>`;

  return svg;
}

// Ensure output directories exist
const iconDir = path.join(__dirname, '../public/img/icons');
const screenshotDir = path.join(__dirname, '../public/img/screenshots');

if (!fs.existsSync(iconDir)) fs.mkdirSync(iconDir, { recursive: true });
if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

// Generate placeholder SVG icons (can be converted to PNG by build process or designer)
console.log('📦 Generating PWA icon placeholders...\n');

// Icon files to generate
const iconSizes = [
  { size: 192, maskable: false, name: 'icon-192x192.svg' },
  { size: 512, maskable: false, name: 'icon-512x512.svg' },
  { size: 192, maskable: true, name: 'icon-192x192-maskable.svg' },
  { size: 512, maskable: true, name: 'icon-512x512-maskable.svg' },
];

iconSizes.forEach(({ size, maskable, name }) => {
  const svg = generateSVGIcon(size, maskable);
  const filePath = path.join(iconDir, name);
  fs.writeFileSync(filePath, svg);
  console.log(`✓ Created: ${name}`);
});

// Create .png placeholders (text files indicating where to place PNG files)
const pngFiles = [
  'icon-192x192.png',
  'icon-512x512.png',
  'icon-192x192-maskable.png',
  'icon-512x512-maskable.png',
];

console.log('\n📸 Icon PNG files required (generate from SVGs):');
pngFiles.forEach(filename => {
  const notePath = path.join(iconDir, `${filename}.md`);
  const note = `# ${filename}

This file should be a PNG image with dimensions ${filename.match(/\d+/)[0]}x${filename.match(/\d+/)[0]}.

**Current Status**: Generate from SVG placeholder or replace with production design.

**Maskable Icons** (for Android 12+):
- Must have ${filename.match(/\d+/)[0]}px safe zone in center
- Background color: #0f172a (dark navy)
- Should work when edge is cut off

**How to Generate**:
1. Use SVG placeholder as base
2. Export to PNG from Figma/Adobe XD, or use online tool: https://convertio.co/svg-png/
3. For maskable icons, ensure 20% padding from edges
4. Place in: public/img/icons/

**For Production**:
Replace all SVG and PNG placeholders with your healthcare clinic branding.
`;
  fs.writeFileSync(notePath, note);
  console.log(`✓ Documented: ${filename}`);
});

// Create screenshot placeholders
console.log('\n🖼️ Creating screenshot placeholders...');

const screenshots = [
  { name: 'screenshot-540x720.txt', width: 540, height: 720 },
  { name: 'screenshot-1280x720.txt', width: 1280, height: 720 },
];

screenshots.forEach(({ name, width, height }) => {
  const note = `# Screenshot Placeholder: ${width}x${height}

This should be a PNG screenshot of the app interface.

**Purpose**: Displayed in app installation dialog on mobile.

**Recommended**:
1. Run app on mobile device
2. Screenshot key views: Queue page, Consultation page, Patient search
3. Export as PNG: ${width}x${height}
4. Place in: public/img/screenshots/

**Or**: Remove from manifest.json if not ready yet.
`;
  fs.writeFileSync(path.join(screenshotDir, name), note);
  console.log(`✓ Documented: ${name}`);
});

console.log('\n✨ PWA icon setup complete!');
console.log('\n📝 Next steps:');
console.log('1. Convert SVG icons to PNG (192x192 and 512x512)');
console.log('2. Replace placeholder SVGs with PNG files');
console.log('3. For maskable icons: ensure 20% safe zone from edges');
console.log('4. Add screenshots (optional but recommended for install experience)');
console.log('5. Run: npm run build\n');
