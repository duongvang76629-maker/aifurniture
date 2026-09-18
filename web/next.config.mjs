/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // 效果图存储在 Cloudflare R2（R2_PUBLIC_URL），并通过
    // Cloudflare「图像 → 转换」按域名做 URL 压缩。
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  // 落地页为单文件静态 HTML（web/public/marketing.html）。
  // 访问 / 直接 serve 此文件，CTA 按钮跳 /studio。
  // 必须放在 beforeFiles：默认的 afterFiles 会被 app/page.tsx 抢先，
  // 导致 / 变成 redirect('/studio')，落地页永远不显示。
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/",
          destination: "/marketing.html",
        },
      ],
    };
  },
};

export default nextConfig;
