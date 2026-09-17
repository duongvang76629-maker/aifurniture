import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "aifurniture.lol · 服务配置",
  description:
    "aifurniture.lol 全栈服务：Google 登录、PostgreSQL、Cloudflare R2、Stripe 订阅、Replicate 渲染回调",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
