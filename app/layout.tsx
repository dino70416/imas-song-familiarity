import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '../components/Providers';

export const metadata: Metadata = {
  title: 'IMAS 偶像大師歌曲熟悉度評估系統',
  description: '快速整理與評估您的 IMAS 歌曲熟悉度，並生成您的個人公開歌單或與好友製作共同歌單！',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
