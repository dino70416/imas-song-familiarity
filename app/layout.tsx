import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '../components/Providers';
import PwaRegister from '../components/PwaRegister';

export const metadata: Metadata = {
  title: 'IMAS 偶像大師歌曲熟悉度評估系統',
  description: '快速整理與評估您的 IMAS 歌曲熟悉度，並生成您的個人公開歌單或與好友製作共同歌單！',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'IMAS',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#92cfbb',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <head>
        <link rel="manifest" href="/api/manifest" crossOrigin="use-credentials" />
      </head>
      <body>
        <PwaRegister />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
