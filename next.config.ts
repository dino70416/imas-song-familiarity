import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * 開發模式允許區網裝置（手機）存取 dev server：
   * Next 16 預設只允許 localhost 來源抓 /_next/*，其他來源會 403、頁面永遠在轉圈。
   * 只影響 `next dev`，production 不受影響。
   */
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.*.*.*'],
};

export default nextConfig;
