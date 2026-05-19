import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';

async function main() {
  const html = await axios.get('https://idolmaster-official.jp/').then(res => res.data);
  const $ = cheerio.load(html);
  
  const svgs: string[] = [];
  $('.style_brand_icon__1PW3m svg').each((i, el) => {
    // clean up React SVG incompatibilities
    const svgHTML = $(el).parent().html() || '';
    // replace style="fill:#..." with fill="..."
    let cleanSVG = svgHTML.replace(/style="([^"]*)"/g, (match, p1) => {
      let styles = '';
      if (p1.includes('fill:')) {
        const fill = p1.match(/fill:([^;]*)/)[1];
        styles += ` fill="${fill}"`;
      }
      if (p1.includes('stroke-width:')) {
        const sw = p1.match(/stroke-width:([^;]*)/)[1];
        styles += ` strokeWidth="${sw}"`;
      }
      return styles;
    });
    // replace viewBox and other camelCases
    cleanSVG = cleanSVG.replace(/viewbox/i, 'viewBox');
    
    svgs.push(cleanSVG);
  });
  
  console.log('SVGs found:', svgs.length);
  const brandKeys = ['music_as', 'music_cg', 'music_ml', 'music_sidem', 'music_shiny', 'music_gakuen', 'music_876'];
  // Assuming the order is 765, CG, ML, SideM, Shiny, Gakuen, Va-liv based on the site menu order
  
  let out = `import React from 'react';\n\nexport function BrandIcon({ brand, className = '' }: { brand: string, className?: string }) {\n  switch (brand) {\n`;
  for(let i=0; i < svgs.length; i++) {
    if (i < brandKeys.length) {
      // replace <svg with <svg className={className} 
      const svgWithClass = svgs[i].replace('<svg ', '<svg className={className} ');
      out += `    case '${brandKeys[i]}': return ${svgWithClass};\n`;
    }
  }
  
  out += `    default: return null;\n  }\n}\n`;
  
  fs.writeFileSync('components/BrandIcon.tsx', out);
}

main();
