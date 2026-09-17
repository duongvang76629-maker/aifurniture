/* ============================================================================
 * Stripe 价格配置
 * 商品与价格在 Stripe 后台创建（当前为 1 个月付 + 1 年付），
 * 把两个 price_ ID 配到环境变量 STRIPE_PRICE_MONTHLY / STRIPE_PRICE_YEARLY。
 * 对接参考：https://github.com/vercel/nextjs-subscription-payments
 * 注意：当前为支付后无限使用的简易版，订阅次数限制、重复订阅判断等
 * 边界逻辑需要自行补充。
 * ==========================================================================*/

export type PlanId = "monthly" | "yearly";

export interface PlanConfig {
  id: PlanId;
  /** Stripe Price ID（未配置时为空串，结账接口返回 503） */
  priceId: string;
  /** 仅用于展示/货币换算，真实扣款以 Stripe 后台价格为准 */
  amount: number; // 美分
  currency: string;
  label: { zh: string; en: string };
}

export const stripeConfig = {
  plans: [
    {
      id: "monthly",
      priceId: process.env.STRIPE_PRICE_MONTHLY ?? "",
      amount: 990,
      currency: "usd",
      label: { zh: "月付", en: "Monthly" },
    },
    {
      id: "yearly",
      priceId: process.env.STRIPE_PRICE_YEARLY ?? "",
      amount: 9900,
      currency: "usd",
      label: { zh: "年付", en: "Yearly" },
    },
  ] satisfies PlanConfig[],

  getPlan(id: string): PlanConfig {
    return this.plans.find((p) => p.id === id) ?? this.plans[0];
  },
};
