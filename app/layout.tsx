import type { Metadata } from 'next';
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
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
