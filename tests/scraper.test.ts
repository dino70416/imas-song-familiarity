import { describe, expect, test } from 'vitest';
import * as cheerio from 'cheerio';
import { normalizeMember } from '../scripts/lib/normalizeMember';

function parseDetailHtml(html: string) {
  const $ = cheerio.load(html);
  let lyrics = '';
  let composer = '';
  $('table tr').each((_, tr) => {
    const label = $(tr).find('td').first().text().trim();
    const val = $(tr).find('td').last().text().trim();
    if (label.includes('作詞')) lyrics = val;
    if (label.includes('作曲')) composer = val;
  });

  const members: string[] = [];
  $('.card h5').each((_, el) => {
    members.push($(el).text().trim());
  });
  return { lyrics, composer, members };
}

/**
 * 完整重現 scripts/scrape.ts 對 `.idol_card .card` 的解析 + normalizeMember 防呆。
 * 跟 production code 一致,改 prod code 同時要改這裡。
 */
function parseMembersWithNormalize(html: string) {
  const $ = cheerio.load(html);
  const out: Array<{ name: string; cvName: string }> = [];
  $('.idol_card .card').each((_, card) => {
    const name = $(card).find('h5').text().trim();
    const cvText = $(card).find('p').text().trim();
    const cvName = cvText.replace('CV:', '').replace('CV', '').trim();
    const normalized = normalizeMember({ name, cvName });
    if (normalized) out.push(normalized);
  });
  return out;
}

test('Parse song detail HTML successfully', () => {
  const mockHtml = `
    <table>
      <tr><td>作詞</td><td>Lyricist Name</td></tr>
      <tr><td>作曲</td><td>Composer Name</td></tr>
    </table>
    <div class="card"><h5>Amami Haruka</h5></div>
    <div class="card"><h5>Kisaragi Chihaya</h5></div>
  `;
  const result = parseDetailHtml(mockHtml);
  expect(result.lyrics).toBe('Lyricist Name');
  expect(result.composer).toBe('Composer Name');
  expect(result.members).toContain('Amami Haruka');
});

describe('scrape integration: normalizeMember 接到實際 cheerio 解析路徑', () => {
  test('765 角色歌(聲優導向格式) → 反向自動翻轉', () => {
    // 模擬 fujiwarahaji.me 的 765 角色歌頁面結構
    const mockHtml = `
      <div class="idol_card">
        <div class="card">
          <h5>今井麻美</h5>
          <p>CV:如月千早役</p>
        </div>
        <div class="card">
          <h5>たかはし智秋</h5>
          <p>CV:三浦あずさ役</p>
        </div>
      </div>
    `;
    const result = parseMembersWithNormalize(mockHtml);
    expect(result).toEqual([
      { name: '如月千早', cvName: '今井麻美' },
      { name: '三浦あずさ', cvName: 'たかはし智秋' },
    ]);
  });

  test('一般 CG/ML 歌(偶像導向格式) → 照原樣', () => {
    const mockHtml = `
      <div class="idol_card">
        <div class="card">
          <h5>島村卯月</h5>
          <p>CV:大橋彩香</p>
        </div>
        <div class="card">
          <h5>渋谷凛</h5>
          <p>CV:福原綾香</p>
        </div>
      </div>
    `;
    const result = parseMembersWithNormalize(mockHtml);
    expect(result).toEqual([
      { name: '島村卯月', cvName: '大橋彩香' },
      { name: '渋谷凛', cvName: '福原綾香' },
    ]);
  });

  test('混合贓資料 + 正常 — 黑名單會被過濾掉、其餘保留', () => {
    const mockHtml = `
      <div class="idol_card">
        <div class="card"><h5>アイドルマスター　SideM</h5><p></p></div>
        <div class="card"><h5>天道輝</h5><p>CV:仲村宗悟</p></div>
        <div class="card"><h5>Cute</h5><p></p></div>
        <div class="card"><h5>島村卯月</h5><p>CV:大橋彩香</p></div>
        <div class="card"><h5>全体</h5><p></p></div>
      </div>
    `;
    const result = parseMembersWithNormalize(mockHtml);
    expect(result).toEqual([
      { name: '天道輝', cvName: '仲村宗悟' },
      { name: '島村卯月', cvName: '大橋彩香' },
    ]);
  });

  test('vα-liv 偶像(黑名單不在內,v4 API 沒收錄)該保留', () => {
    const mockHtml = `
      <div class="idol_card">
        <div class="card"><h5>上水流宇宙</h5><p></p></div>
        <div class="card"><h5>灯里愛夏</h5><p></p></div>
      </div>
    `;
    const result = parseMembersWithNormalize(mockHtml);
    expect(result).toEqual([
      { name: '上水流宇宙', cvName: '' },
      { name: '灯里愛夏', cvName: '' },
    ]);
  });

  test('反向格式 + 黑名單混合(極端對抗例)', () => {
    const mockHtml = `
      <div class="idol_card">
        <div class="card"><h5>今井麻美</h5><p>CV:如月千早役</p></div>
        <div class="card"><h5>noctchill</h5><p></p></div>
        <div class="card"><h5>原由実</h5><p>CV:四条貴音役</p></div>
        <div class="card"><h5>illumination STARS</h5><p></p></div>
        <div class="card"><h5></h5><p>CV:無名</p></div>
      </div>
    `;
    const result = parseMembersWithNormalize(mockHtml);
    // 期望:noctchill / illumination STARS / 空 name 都被 skip,
    //       反向 2 個被翻轉
    expect(result).toEqual([
      { name: '如月千早', cvName: '今井麻美' },
      { name: '四条貴音', cvName: '原由実' },
    ]);
  });
});
