/**
 * 將 hex 色碼轉成 rgba 字串。
 */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 加深 hex 色碼（混入黑色），amount 為 0~1（0.2 = 深 20%）。
 */
function darkenHex(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  const r = Math.round(parseInt(clean.slice(0, 2), 16) * (1 - amount));
  const g = Math.round(parseInt(clean.slice(2, 4), 16) * (1 - amount));
  const b = Math.round(parseInt(clean.slice(4, 6), 16) * (1 - amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * 計算 hex 色碼的相對亮度（0 最暗 ~ 1 最亮），並決定其上方應使用的對比文字色。
 * 遵循 WCAG 2.1 亮度公式。
 */
export function getAccentTextColor(hex: string): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  const luminance =
    0.2126 * toLinear(r) +
    0.7152 * toLinear(g) +
    0.0722 * toLinear(b);

  // 亮度 > 0.35 用深色文字；暗色背景用白色文字
  return luminance > 0.35 ? '#1e293b' : '#ffffff';
}

/**
 * 依據主題色，產生所有衍生 CSS 變數的 inline style 物件。
 * 直接注入 wrapper div，確保所有瀏覽器均能正確響應顏色變更，
 * 不依賴 CSS color-mix() 的懶計算行為。
 */
export function buildThemeVars(hex: string): Record<string, string> {
  const onColor = getAccentTextColor(hex);
  return {
    '--accent-color': hex,
    '--accent-on-color': onColor,
    '--accent-glow': hexToRgba(hex, 0.25),
    '--accent-glow-soft': hexToRgba(hex, 0.12),
    '--accent-glow-medium': hexToRgba(hex, 0.35),
    '--accent-hover': darkenHex(hex, 0.15),
    '--accent-text-dark': darkenHex(hex, 0.38),
  };
}

/**
 * 取得各品牌的代表色
 */
export function getBrandColor(brandId: string): string {
  switch (brandId) {
    case 'music_as': return '#F34F6D';
    case 'music_cg': return '#2681C8';
    case 'music_ml': return '#FFC30B';
    case 'music_sidem': return '#0FBE94';
    case 'music_shiny': return '#8DBBFF';
    case 'music_gakuen': return '#F39800';
    case 'music_876': return '#656A75';
    case 'music_godo':
    case 'all': return '#FF74B8';
    default: return '#94a3b8'; // fallback
  }
}

/**
 * 取得各品牌的日文顯示名稱
 */
export function getBrandDisplayName(brandId: string): string {
  switch (brandId) {
    case 'music_as': return 'アイドルマスター (765)';
    case 'music_cg': return 'シンデレラガールズ (CG)';
    case 'music_ml': return 'ミリオンライブ！ (ML)';
    case 'music_sidem': return 'SideM (SideM)';
    case 'music_shiny': return 'シャイニーカラーズ (SC)';
    case 'music_gakuen': return '学園アイドルマスター (学マス)';
    case 'music_876': return 'vα-liv (876)';
    case 'music_godo': return '合同曲 (全體)';
    case 'music_cover': return 'Cover 曲';
    case 'music_remix': return 'Remix 曲';
    case 'all': return '所有分類 (ALL)';
    default: return brandId.replace('music_', '').toUpperCase();
  }
}

// 取品牌的短碼版本（給空間有限的 chip / 手機版用）：盡量取括號裡的短碼，
// 沒有括號就回原名（如 "Cover 曲" / "Remix 曲"）
export function getBrandShortName(brandId: string): string {
  const full = getBrandDisplayName(brandId);
  const m = full.match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : full;
}
