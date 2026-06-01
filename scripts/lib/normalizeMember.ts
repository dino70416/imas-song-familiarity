/**
 * 把 fujiwarahaji.me 抓回來的「member」原始字串(`.idol_card .card` 裡的 h5 + p)
 * 在寫進 DB 之前正規化,避免歷史踩過的兩個雷:
 *
 *   1. 反向資料 — 765 角色歌頁面是「聲優導向格式」(h5=聲優, p=「XXX役」),
 *      scrape.ts 原本照寫,結果建出 name=今井麻美, cvName=如月千早役 這種反過來的 Member row。
 *      → 偵測 cvName.endsWith('役') 時,把 name/cvName 翻轉,並去掉「役」字。
 *
 *   2. 黑名單 — 系列名 / CG 屬性類別 / SC unit 名 / 標籤被誤抓進 Member 表
 *      (CoMETIK、Cute、Cool、Princess、アイドルマスター　SideM、全体、偶像大师.KR …)。
 *      → 整列 skip,不寫入。
 *
 * 這個 helper 是 pure function,沒任何副作用,方便用 vitest 單測。
 */

/** 系列名 / 類別 / unit 名 — 整列 skip 不寫進 Member */
export const MEMBER_BLACKLIST = new Set<string>([
  // 系列名稱 (M-A)
  'アイドルマスター　SideM',
  'アイドルマスター　シンデレラガールズ',
  'アイドルマスター　ミリオンライブ！',
  'アイドルマスター　シャイニーカラーズ',
  'アイドルマスター XENOGLOSSIA',
  '学園アイドルマスター',
  'PROJECT IM@S vα-liv',
  // CG 五大屬性類別 (M-B) — 這些是「分類」不是「人」
  'Cute',
  'Cool',
  'Passion',
  'Mental',
  'Physical',
  'Fairy',
  'Princess',
  'Angel',
  'Intelli',
  // Shiny Colors units (M-C) — 這些是「組合」名,該進 Unit 表不是 Member
  'CoMETIK',
  'ALSTROEMERIA',
  'illumination STARS',
  "L'Antica",
  'noctchill',
  'Straylight',
  'SHHis',
  // 雜項標籤 (M-D)
  '全体',
  // 中文化標籤 (M-F)
  '偶像大师.KR',
]);

export interface RawMemberCard {
  name: string;
  cvName: string;
}

export interface NormalizedMember {
  name: string;
  cvName: string;
}

/**
 * @returns 正規化後可寫入 DB 的 member,或 null (整列 skip)
 */
export function normalizeMember(raw: RawMemberCard): NormalizedMember | null {
  const name = (raw.name ?? '').trim();
  const cvName = (raw.cvName ?? '').trim();

  // 1. 空名 → skip
  if (!name) return null;

  // 2. 黑名單 → skip
  if (MEMBER_BLACKLIST.has(name)) return null;

  // 3. 反向資料偵測 — cvName 結尾是「役」表示 name 是聲優, cvName 是角色描述
  //    → 翻轉,並去掉「役」字
  if (cvName.endsWith('役')) {
    const role = cvName.replace(/役$/, '').trim();
    // 翻轉後若 role 變空(只有「役」字),退回 skip 避免建出沒名字的 row
    if (!role) return null;
    return { name: role, cvName: name };
  }

  // 4. 正常情形 — 照原樣
  return { name, cvName };
}
