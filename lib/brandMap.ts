// 全部 brand 值（UI 順序）— 之前在 page.tsx 與 PlaylistList.tsx 各自重複定義一份
export const BRAND_VALUES = [
  'music_as',
  'music_876',
  'music_cg',
  'music_ml',
  'music_sidem',
  'music_shiny',
  'music_gakuen',
  'music_godo',
  'music_remix',
  'music_cover',
] as const;

// brand (UI 選單) → production codes 對照
//
// 注意：fujiwarahaji.me 同一事務所在不同 endpoint 用不同代碼，例如：
//   /list?type=idol → 283 (新版)
//   /tax (unit member) → sc (舊版)
// 所以一個 brand 可能映射到多個 production 值。
export const brandToProduction: Record<string, string[]> = {
  music_cg: ['cg'],
  music_ml: ['765'],
  music_as: ['765'],
  music_876: ['876'], // vα-liv 偶像由 scripts/fix-876.ts 重新歸到 '876' (來源 API 全混在 765 裡)
  music_shiny: ['sc', '283'], // sc 是舊代碼、283 是新代碼，兩個都接
  music_sidem: ['315'],
  music_gakuen: ['gakuen', 'hatsuboshi'],
  music_godo: [], // 跨 IP 合作曲：不過濾偶像/組合
  music_cover: [],
  music_remix: [],
  all: [],
};

// brand selected → 是否要過濾偶像/組合下拉？空陣列 = 不過濾（顯示全部）
export function shouldFilterByProduction(brand: string): boolean {
  const codes = brandToProduction[brand];
  return Array.isArray(codes) && codes.length > 0;
}

// production 屬於該 brand 嗎？
export function productionMatchesBrand(
  production: string | null | undefined,
  brand: string,
): boolean {
  if (!shouldFilterByProduction(brand)) return true;
  if (!production) return false;
  return brandToProduction[brand].includes(production);
}
