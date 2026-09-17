/* ============================================================================
 * 创建 Stripe Checkout Session（订阅模式）
 * POST { plan: "monthly" | "yearly" }
 * ==========================================================================*/
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { stripeConfig } from "@/configs/stripeConfig";
import { siteConfig } from "@/configs/site";
import { query } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const { plan } = (await req.json().catch(() => ({}))) as { plan?: string };
    const conf = stripeConfig.getPlan(plan ?? "monthly");
    if (!conf.priceId) {
      return Response.json({ error: "price_not_configured" }, { status: 503 });
    }

    const stripe = getStripe();
    const email = session.user.email;

    // 已有 Stripe 客户则复用
    const existing = await query<{ stripe_customer_id: string }>(
      `SELECT sc.stripe_customer_id
         FROM stripe_customers sc
         JOIN users u ON u.id = sc.user_id
        WHERE u.email = $1`,
      [email]
    );

    let customerId: string;
    if (existing.rowCount && existing.rowCount > 0) {
      customerId = existing.rows[0].stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email,
        name: session.user.name ?? undefined,
      });
      customerId = customer.id;
      await query(
        `INSERT INTO stripe_customers (user_id, stripe_customer_id)
         SELECT id, $2 FROM users WHERE email = $1`,
        [email, customerId]
      );
    }

    const checkout = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: conf.priceId, quantity: 1 }],
      subscription_data: { metadata: { user_email: email } },
      success_url: `${siteConfig.url}/?checkout=success`,
      cancel_url: `${siteConfig.url}/?checkout=cancel`,
    });

    return Response.json({ url: checkout.url });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
