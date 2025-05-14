import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });
const geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sdjz / Chat | 匿名在线聊天室",
  description: "免费在线聊天室，无需注册，一键加入。支持私密聊天、文件传输。完全匿名，保护隐私。",
  keywords: [
    "在线聊天室",
    "匿名聊天",
    "临时聊天",
    "一对一聊天",
    "私密聊天",
    "加密聊天",
    "免注册聊天",
    "即时聊天",
    "在线聊天"
  ],
  authors: [{ name: "shuakami", url: "https://chat.sdjz.wiki" }],
  openGraph: {
    title: "Sdjz / Chat | 匿名在线聊天室",
    description: "免费在线聊天室，无需注册，一键加入。支持私密聊天、文件传输。完全匿名，保护隐私。",
    type: "website",
    locale: "zh_CN",
    siteName: "匿名聊天室",
  },
  twitter: {
    card: "summary_large_image",
    title: "匿名在线聊天室",
    description: "免费在线聊天室，无需注册，一键加入。支持私密聊天、文件传输。",
  },
  viewport: "width=device-width, initial-scale=1.0",
  themeColor: "#0c0c0c",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh">
      <body className={`${geist.className} ${geistMono.className}`}>{children}</body>
    </html>
  );
}
