import { NextResponse } from 'next/server';
import { AppError, handleError } from '@/lib/errors';
import { rateLimit } from '@/lib/rateLimit';
import { buildItunesLookupUrl, isValidAppleTrackId, pickApplePreview, ItunesTrack } from '@/lib/apple';

/**
 * GET /api/apple/preview?trackId=1659358253
 *
 * 用 iTunes lookup 取得該曲目「目前」的 30 秒試聽 URL 與封面。
 * - previewUrl 會隨時間變動，所以 DB 只存 trackId，播放前才查。
 * - 音檔本身不經過我們的 server，前端 <audio> 直接串 Apple CDN（符合 Apple 「僅串流、不快取」條款）。
 * - lookup 結果以 Next fetch cache 快取 6 小時，避開 iTunes Search API 約 20 次/分的限制。
 */
const LOOKUP_REVALIDATE_SECONDS = 6 * 60 * 60;

export async function GET(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    // 每個 IP 60 次額度、每 10 秒補 6 次：主持人翻題綽綽有餘，擋掉掃 ID 的濫用
    if (!rateLimit(`apple-preview:${ip}`, 60, 6, 10000)) {
      throw new AppError('請求過於頻繁，請稍後再試。', 429, 'RATE_LIMITED');
    }

    const { searchParams } = new URL(request.url);
    const trackId = searchParams.get('trackId')?.trim() ?? '';
    if (!trackId || !isValidAppleTrackId(trackId)) {
      throw new AppError('trackId 格式不正確。', 400, 'BAD_REQUEST');
    }

    const res = await fetch(buildItunesLookupUrl(trackId), {
      next: { revalidate: LOOKUP_REVALIDATE_SECONDS },
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new AppError('Apple Music 查詢暫時無法使用，請稍後再試。', 502, 'UPSTREAM_ERROR');
    }

    const data = (await res.json()) as { resultCount?: number; results?: ItunesTrack[] };
    const preview = pickApplePreview(data.results ?? [], trackId);
    if (!preview) {
      throw new AppError('此曲目在 Apple Music 沒有可用的試聽。', 404, 'NOT_FOUND');
    }

    return NextResponse.json(preview);
  } catch (error: unknown) {
    return handleError(error);
  }
}
