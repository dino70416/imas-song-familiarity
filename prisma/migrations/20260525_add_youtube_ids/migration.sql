-- AlterTable: Song 新增 youtubeIds 欄位
-- 儲存公式動画的 YouTube video ID，多個以逗號分隔（例如 "YqY5xwTRinA,abc123def45"）
-- 為 nullable：null = 尚未爬取，'' = 已確認無公式動画
ALTER TABLE "Song" ADD COLUMN "youtubeIds" TEXT;
