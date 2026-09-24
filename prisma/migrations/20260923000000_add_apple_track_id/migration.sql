-- AlterTable: Song 新增 appleTrackId 欄位
-- 儲存 iTunes / Apple Music 曲目 ID（Apple Music 分享連結 ?i= 後面的數字），供副歌猜歌出題機播放 30 秒試聽
-- 為 nullable：null = 尚未處理，'' = 已確認 Apple Music 沒有
ALTER TABLE "Song" ADD COLUMN "appleTrackId" TEXT;
