import type { Metadata } from 'next';
import { PlausibleAnalytics } from './PlausibleAnalytics';
import './globals.css';

export const metadata: Metadata = {
  title: 'IELTS 7+ | 个人训练系统',
  description: '从 B1 走向 IELTS 7+ 的个人英语训练系统。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const analyticsScriptUrl = process.env.GITHUB_ACTIONS === 'true' && process.env.NODE_ENV === 'production'
    ? process.env.PLAUSIBLE_SCRIPT_URL?.trim()
    : undefined;

  return (
    <html lang="zh-CN">
      <body>{children}{analyticsScriptUrl && <PlausibleAnalytics scriptUrl={analyticsScriptUrl} />}</body>
    </html>
  );
}
