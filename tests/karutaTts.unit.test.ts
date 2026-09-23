import { describe, expect, test } from 'vitest';
import { buildKarutaSsml, ttsFileUrl } from '@/lib/karutaTts';

describe('buildKarutaSsml', () => {
  test('每行之間加 600ms 停頓、跳脫 XML、去掉空行', () => {
    expect(buildKarutaSsml('君と <未来>\n\n歩こう & 歌おう\n')).toBe(
      '<speak>君と &lt;未来&gt;<break time="600ms"/>歩こう &amp; 歌おう</speak>',
    );
  });
  test('也接受「／」當分行', () => {
    expect(buildKarutaSsml('ラララ／ルルル')).toBe('<speak>ラララ<break time="600ms"/>ルルル</speak>');
  });
});

test('ttsFileUrl', () => {
  expect(ttsFileUrl('abc-123')).toBe('/kamisabi/tts/abc-123.mp3');
});
