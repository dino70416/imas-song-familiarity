/**
 * KAMISABI 出題機用的品牌對照：實體歌牌上印的是官方日文全名
 */
export function getKamisabiBrandName(brandId: string): string {
  switch (brandId) {
    case 'music_as': return 'アイドルマスター';
    case 'music_cg': return 'アイドルマスター シンデレラガールズ';
    case 'music_ml': return 'アイドルマスター ミリオンライブ！';
    case 'music_sidem': return 'アイドルマスター SideM';
    case 'music_shiny': return 'アイドルマスター シャイニーカラーズ';
    case 'music_gakuen': return '学園アイドルマスター';
    case 'music_876': return 'アイドルマスター vα-liv';
    default: return 'アイドルマスター';
  }
}
