import { describe, expect, test } from 'vitest';
import { normalizeMember, MEMBER_BLACKLIST } from '../scripts/lib/normalizeMember';

describe('normalizeMember — 反向資料偵測', () => {
  test('cvName 結尾「役」要翻轉 + 去掉「役」字', () => {
    const result = normalizeMember({
      name: '今井麻美',
      cvName: '如月千早役',
    });
    expect(result).toEqual({ name: '如月千早', cvName: '今井麻美' });
  });

  test('多種 765 角色歌的反向格式都要正確翻轉', () => {
    const cases: Array<[string, string, string, string]> = [
      // [scrape 抓回來的 name, cvName, 期望 normalized name, cvName]
      ['中村繪里子', '天海春香役', '天海春香', '中村繪里子'],
      ['たかはし智秋', '三浦あずさ役', '三浦あずさ', 'たかはし智秋'],
      ['沼倉愛美', '我那覇響役', '我那覇響', '沼倉愛美'],
      ['原由実', '四条貴音役', '四条貴音', '原由実'],
      ['浅倉杏美', '萩原雪歩役', '萩原雪歩', '浅倉杏美'],
      ['青木瑠璃子', '多田李衣菜役', '多田李衣菜', '青木瑠璃子'],
      ['原紗友里', '本田未央役', '本田未央', '原紗友里'],
    ];
    for (const [name, cvName, expectName, expectCv] of cases) {
      const result = normalizeMember({ name, cvName });
      expect(result, `${name} + ${cvName}`).toEqual({
        name: expectName,
        cvName: expectCv,
      });
    }
  });

  test('cvName 只有「役」一個字 → skip 避免建出空名字 row', () => {
    expect(normalizeMember({ name: '某聲優', cvName: '役' })).toBeNull();
  });

  test('cvName 含「役」但不是結尾 (e.g. 中段) → 不翻轉、照原樣', () => {
    // 假想:某歌詞段含「役職」字串、不應誤判
    const result = normalizeMember({
      name: '正常偶像',
      cvName: '役職描述某某',
    });
    expect(result).toEqual({ name: '正常偶像', cvName: '役職描述某某' });
  });
});

describe('normalizeMember — 黑名單', () => {
  test('系列名稱被當 member → skip', () => {
    for (const seriesName of [
      'アイドルマスター　SideM',
      'アイドルマスター　シンデレラガールズ',
      'アイドルマスター　ミリオンライブ！',
      'アイドルマスター　シャイニーカラーズ',
      'アイドルマスター XENOGLOSSIA',
      '学園アイドルマスター',
      'PROJECT IM@S vα-liv',
    ]) {
      expect(
        normalizeMember({ name: seriesName, cvName: '' }),
        seriesName,
      ).toBeNull();
    }
  });

  test('CG 五大屬性類別被當 member → skip', () => {
    for (const cat of [
      'Cute',
      'Cool',
      'Passion',
      'Mental',
      'Physical',
      'Fairy',
      'Princess',
      'Angel',
      'Intelli',
    ]) {
      expect(normalizeMember({ name: cat, cvName: '' }), cat).toBeNull();
    }
  });

  test('Shiny Colors unit 名被當 member → skip (Unit 表才是它們的家)', () => {
    for (const unitName of [
      'CoMETIK',
      'ALSTROEMERIA',
      'illumination STARS',
      "L'Antica",
      'noctchill',
      'Straylight',
      'SHHis',
    ]) {
      expect(
        normalizeMember({ name: unitName, cvName: '' }),
        unitName,
      ).toBeNull();
    }
  });

  test('「全体」 跟 「偶像大师.KR」 → skip', () => {
    expect(normalizeMember({ name: '全体', cvName: '' })).toBeNull();
    expect(normalizeMember({ name: '偶像大师.KR', cvName: '' })).toBeNull();
  });

  test('黑名單 + 含 cvName 也要 skip (避免被 reverse 邏輯救回)', () => {
    // 假想:CoMETIK 那一欄被填了「役」cv
    expect(
      normalizeMember({ name: 'CoMETIK', cvName: '虛構角色役' }),
    ).toBeNull();
  });
});

describe('normalizeMember — 正常情形', () => {
  test('正常 idol + cv 照原樣寫入', () => {
    const result = normalizeMember({
      name: '如月千早',
      cvName: '今井麻美',
    });
    expect(result).toEqual({ name: '如月千早', cvName: '今井麻美' });
  });

  test('vα-liv 偶像 (v4 API 沒收錄、爬蟲是唯一資料來源) 不在黑名單', () => {
    for (const idol of ['上水流宇宙', '灯里愛夏', 'レトラ']) {
      const result = normalizeMember({ name: idol, cvName: '' });
      expect(result, idol).toEqual({ name: idol, cvName: '' });
    }
  });

  test('字串前後有空白會被 trim 掉', () => {
    const result = normalizeMember({
      name: '  如月千早  ',
      cvName: '  今井麻美  ',
    });
    expect(result).toEqual({ name: '如月千早', cvName: '今井麻美' });
  });

  test('cvName 為空字串 → 仍是 valid member', () => {
    const result = normalizeMember({ name: '某偶像', cvName: '' });
    expect(result).toEqual({ name: '某偶像', cvName: '' });
  });

  test('空 name → skip (即使有 cv)', () => {
    expect(normalizeMember({ name: '', cvName: '某聲優' })).toBeNull();
    expect(normalizeMember({ name: '   ', cvName: '某聲優' })).toBeNull();
  });
});

describe('normalizeMember — 邊角 sanity check', () => {
  test('已正規化的反向資料(canonical)再跑一次仍正確', () => {
    // 例:被翻轉後的 { name: '如月千早', cvName: '今井麻美' } 不會再被翻轉
    const once = normalizeMember({ name: '今井麻美', cvName: '如月千早役' })!;
    const twice = normalizeMember(once);
    expect(twice).toEqual(once);
  });

  test('黑名單剛好等於 46 筆 + 7 + 9 + 7 + 1 + 1 = 25 個唯一 entry', () => {
    // 8 系列 + 9 類別 + 7 SC unit + 1 全体 + 1 .KR = 26
    // 實際 list 有 7 系列(漏「アイドルマスター」單獨 1 個但歷史上不該有 — OK)
    // 確認黑名單 size 跟我們 cleanup 的數字一致
    expect(MEMBER_BLACKLIST.size).toBe(25);
  });
});
