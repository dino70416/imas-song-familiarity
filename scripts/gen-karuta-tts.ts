/**
 * 用 Google Cloud Text-to-Speech 把 scripts/karuta-lyrics.ts 的副歌片段產成 mp3，
 * 輸出 public/kamisabi/tts/<songId>.mp3（songId 由曲名查 Neon）。
 *
 * 認證二選一（只在本機跑，不放 Vercel；可寫在 .env，Prisma client 初始化時會載入）：
 *   GOOGLE_TTS_API_KEY=...                       → 用 API key
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/sa.json → 服務帳戶 JSON（自行簽 JWT 換 access token，不需要額外套件）
 * 可選：KARUTA_TTS_VOICE（預設 ja-JP-Neural2-B）
 * 已存在的檔案會跳過，加 --force 重新產生。
 */
import fs from 'fs';
import path from 'path';
import { createSign } from 'crypto';
import { prisma } from './lib/prisma';
import { KARUTA_LYRICS } from './karuta-lyrics';
import { buildKarutaSsml, KARUTA_TTS_RATE, KARUTA_TTS_VOICE } from '../lib/karutaTts';

const OUT_DIR = path.join(__dirname, '..', 'public', 'kamisabi', 'tts');
const force = process.argv.includes('--force');

async function serviceAccountToken(credsPath: string): Promise<string> {
  const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8')) as { client_email: string; private_key: string; token_uri?: string };
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: creds.token_uri ?? 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(creds.private_key).toString('base64url');
  const res = await fetch(creds.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function main() {
  const entries = Object.entries(KARUTA_LYRICS).filter(([title, lyrics]) => {
    if (lyrics.trim()) return true;
    console.warn(`還沒填歌詞，跳過：${title}`);
    return false;
  });
  if (entries.length === 0) {
    console.log('scripts/karuta-lyrics.ts 還沒有任何一首填了副歌片段。');
    return;
  }
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!apiKey && !credsPath) throw new Error('請設定 GOOGLE_TTS_API_KEY 或 GOOGLE_APPLICATION_CREDENTIALS');
  const bearer = apiKey ? null : await serviceAccountToken(credsPath as string);
  const endpoint = `https://texttospeech.googleapis.com/v1/text:synthesize${apiKey ? `?key=${encodeURIComponent(apiKey)}` : ''}`;
  const voice = process.env.KARUTA_TTS_VOICE ?? KARUTA_TTS_VOICE;
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let done = 0;
  for (const [title, lyrics] of entries) {
    const song = await prisma.song.findFirst({
      where: { title, appleTrackId: { not: null }, NOT: { appleTrackId: '' } },
      select: { id: true, title: true },
    });
    if (!song) {
      console.warn(`找不到有 Apple ID 的歌：${title}（先用 seed:apple-ids 補）`);
      continue;
    }
    const out = path.join(OUT_DIR, `${song.id}.mp3`);
    if (fs.existsSync(out) && !force) {
      console.log(`skip ${title}（已存在）`);
      continue;
    }
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      body: JSON.stringify({
        input: { ssml: buildKarutaSsml(lyrics) },
        voice: { languageCode: 'ja-JP', name: voice },
        audioConfig: { audioEncoding: 'MP3', speakingRate: KARUTA_TTS_RATE },
      }),
    });
    if (!res.ok) {
      console.error(`TTS 失敗 ${title}: ${res.status} ${await res.text()}`);
      continue;
    }
    const { audioContent } = (await res.json()) as { audioContent: string };
    fs.writeFileSync(out, Buffer.from(audioContent, 'base64'));
    console.log(`ok ${title} → ${path.relative(process.cwd(), out)}`);
    done++;
  }
  console.log(`完成 ${done} 首`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
