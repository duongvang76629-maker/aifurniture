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
};

export default nextConfig;
