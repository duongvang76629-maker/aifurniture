/* Stripe 服务端客户端（懒加载） */
import Stripe from "stripe";

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripe) return stripe;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY 未配置");
  stripe = new Stripe(secretKey);
  return stripe;
}
