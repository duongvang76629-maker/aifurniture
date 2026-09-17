/* ============================================================================
 * 环境变量集中读取 + 配置就绪状态（供首页配置检查面板使用）
 * 仅返回“是否已配置”，不回显具体值，避免泄露密钥。
 * ==========================================================================*/

function valueOf(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function isConfigured(name: string): boolean {
  const v = valueOf(name);
  // 模板占位符视为未配置
  if (!v) return false;
  return ![
    "sk_test_",
    "pk_test_",
    "whsec_",
    "price_",
    "r8_",
  ].some((ph) => v === ph);
}

export interface ConfigItem {
  group: string;
  key: string;
  label: string;
  configured: boolean;
  hint?: string;
}

export function getConfigStatus(): ConfigItem[] {
  return [
    { group: "应用", key: "NEXTAUTH_SECRET", label: "NextAuth 密钥", configured: isConfigured("NEXTAUTH_SECRET") },
    { group: "数据库", key: "DATABASE_URL", label: "PostgreSQL 连接串", configured: isConfigured("DATABASE_URL") },
    { group: "Google 登录", key: "GOOGLE_CLIENT_ID", label: "OAuth Client ID", configured: isConfigured("GOOGLE_CLIENT_ID") },
    { group: "Google 登录", key: "GOOGLE_CLIENT_SECRET", label: "OAuth Client Secret", configured: isConfigured("GOOGLE_CLIENT_SECRET") },
    { group: "Cloudflare R2", key: "R2_ACCOUNT_ID", label: "R2 Account ID", configured: isConfigured("R2_ACCOUNT_ID") },
    { group: "Cloudflare R2", key: "R2_ACCESS_KEY_ID", label: "R2 Access Key", configured: isConfigured("R2_ACCESS_KEY_ID") },
    { group: "Cloudflare R2", key: "R2_SECRET_ACCESS_KEY", label: "R2 Secret Key", configured: isConfigured("R2_SECRET_ACCESS_KEY") },
    { group: "Cloudflare R2", key: "R2_BUCKET_NAME", label: "R2 Bucket", configured: isConfigured("R2_BUCKET_NAME") },
    { group: "Stripe", key: "STRIPE_SECRET_KEY", label: "Stripe Secret Key", configured: isConfigured("STRIPE_SECRET_KEY") },
    { group: "Stripe", key: "STRIPE_WEBHOOK_SECRET", label: "Webhook Signing Secret", configured: isConfigured("STRIPE_WEBHOOK_SECRET") },
    { group: "Stripe", key: "STRIPE_PRICE_MONTHLY", label: "月付 Price ID", configured: isConfigured("STRIPE_PRICE_MONTHLY") },
    { group: "Stripe", key: "STRIPE_PRICE_YEARLY", label: "年付 Price ID", configured: isConfigured("STRIPE_PRICE_YEARLY") },
    { group: "Replicate", key: "REPLICATE_API_TOKEN", label: "API Token", configured: isConfigured("REPLICATE_API_TOKEN") },
    { group: "Replicate", key: "REPLICATE_WEBHOOK_URL", label: "Webhook 公网地址", configured: isConfigured("REPLICATE_WEBHOOK_URL") },
    { group: "定时任务", key: "CRON_SECRET", label: "Cron 调用密钥", configured: isConfigured("CRON_SECRET") },
  ];
}
