import fs from 'fs';
import path from 'path';

async function scrapeColors() {
  try {
    const data = fs.readFileSync('C:/Users/DinoLiao/.gemini/antigravity/brain/a7caa64b-2e7e-4758-90e0-332c852d437c/.system_generated/steps/687/content.md', 'utf-8');

    const colors = [];
    const regex = /\["([^"]+)"\]\s*=\s*\{"([^"]+)"/g;
    let match;
    while ((match = regex.exec(data)) !== null) {
      const names = match[1].split('|');
      const color = match[2];
      // 只保留第一個名字（日文名），避免簡體中文或翻譯名稱重複
      if (names[0] && names[0].trim()) {
        colors.push({ name: names[0].trim(), color });
      }
    }

    const outputPath = path.join(process.cwd(), 'data', 'idol-colors.json');
    if (!fs.existsSync(path.dirname(outputPath))) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(colors, null, 2), 'utf-8');
    console.log(`Scraped ${colors.length} idol colors and saved to ${outputPath}`);
  } catch (error) {
    console.error('Error scraping colors:', error);
  }
}

scrapeColors();
