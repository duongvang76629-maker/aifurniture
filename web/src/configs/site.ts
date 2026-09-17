/** 站点级配置 */
export const siteConfig = {
  name: "aifurniture.lol",
  /** 对外站点地址（支付回跳、OAuth 拼址用） */
  get url() {
    return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  },
  defaultLocale: "zh",
  locales: ["zh", "en"],
} as const;
