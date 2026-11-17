const sharp = require('sharp');
const fs = require('fs');
const https = require('https');

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function createTailoredThumbnail(title, rawImageUrl, outputPath) {
  const width = 1280;
  const height = 720;
  
  // Clean title for display
  let displayTitle = title.trim();
  if (displayTitle.length > 55) {
    displayTitle = displayTitle.substring(0, 52) + '...';
  }

  // Elegant dark gradient banner with golden accents and brand label
  const svgOverlay = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bottomShadow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#000000" stop-opacity="0" />
          <stop offset="50%" stop-color="#050b14" stop-opacity="0.6" />
          <stop offset="85%" stop-color="#050b14" stop-opacity="0.95" />
          <stop offset="100%" stop-color="#02060d" stop-opacity="1" />
        </linearGradient>
        <linearGradient id="goldBar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f6d365" />
          <stop offset="100%" stop-color="#fda085" />
        </linearGradient>
      </defs>

      <!-- Gradient Banner at bottom -->
      <rect x="0" y="320" width="${width}" height="400" fill="url(#bottomShadow)" />

      <!-- Golden vertical accent bar -->
      <rect x="70" y="525" width="8" height="120" rx="4" fill="url(#goldBar)" />

      <!-- Subtitle / Brand Badge -->
      <text x="95" y="555" font-family="'Pyidaungsu', 'Padauk', 'Myanmar Text', sans-serif" font-size="24" font-weight="600" fill="#f6d365" letter-spacing="1">
        ✦ NS PUZZLE LIGHTHOUSE • အသိပညာပေး အစ္စလာမ့်ဆောင်းပါး
      </text>

      <!-- Main Myanmar Title -->
      <text x="95" y="615" font-family="'Pyidaungsu', 'Padauk', 'Myanmar Text', sans-serif" font-size="44" font-weight="bold" fill="#ffffff">
        ${displayTitle}
      </text>
    </svg>
  `);

  let baseBuffer;
  if (rawImageUrl.startsWith('http')) {
    baseBuffer = await downloadImage(rawImageUrl);
  } else {
    baseBuffer = fs.readFileSync(rawImageUrl);
  }

  const finalImage = await sharp(baseBuffer)
    .resize(width, height)
    .composite([{ input: svgOverlay, top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer();

  fs.writeFileSync(outputPath, finalImage);
  console.log(`Saved thumbnail with title to ${outputPath} (${finalImage.length} bytes)`);
  return outputPath;
}

// Quick test
createTailoredThumbnail(
  'ဆွေးနွေးငြင်းခုံရာတွင် အော်ဟစ်ခြင်းထက် ဉာဏ်ပညာကို ဦးစားပေးခြင်း',
  'test_pollinations.jpg',
  'test_thumbnail_final.jpg'
).then(() => console.log('Thumbnail creation test passed!'))
 .catch(console.error);

module.exports = { createTailoredThumbnail };
