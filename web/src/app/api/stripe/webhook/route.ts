/* ============================================================================
 * Stripe Webhook（需在 Stripe 后台注册端点，并把 Signing secret
 * 配到 STRIPE_WEBHOOK_SECRET）
 * 幂等：以 stripe_subscription_id 做 upsert，重复投递不产生重复行。
 * ==========================================================================*/
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { query } from "@/lib/db";

async function upsertSubscription(sub: Stripe.Subscription): Promise<void> {
  const item = sub.items.data[0];
  const email = (sub.metadata?.user_email as string | undefined) ?? null;

  let userId: string | null = null;
  if (email) {
    const u = await query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
    userId = u.rows[0]?.id ?? null;
  }

  await query(
    `INSERT INTO subscriptions
       (user_id, user_email, stripe_subscription_id, stripe_customer_id,
        stripe_price_id, status, current_period_end)
     VALUES ($1,$2,$3,$4,$5,$6,to_timestamp($7))
     ON CONFLICT (stripe_subscription_id) DO UPDATE SET
       user_id            = EXCLUDED.user_id,
       user_email         = EXCLUDED.user_email,
       stripe_customer_id = EXCLUDED.stripe_customer_id,
       stripe_price_id    = EXCLUDED.stripe_price_id,
       status             = EXCLUDED.status,
       current_period_end = EXCLUDED.current_period_end,
       updated_at         = now()`,
    [
      userId,
      email,
      sub.id,
      (sub.customer as string) ?? null,
      item?.price.id ?? null,
      sub.status,
      sub.current_period_end ?? null,
    ]
  );
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json({ error: "stripe webhook not configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, secret);
  } catch (e) {
    return new Response(`invalid signature: ${(e as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await upsertSubscription(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await query(
          "UPDATE subscriptions SET status = $2, updated_at = now() WHERE stripe_subscription_id = $1",
          [sub.id, sub.status]
        );
        break;
      }

      case "checkout.session.completed": {
        const sess = event.data.object as Stripe.Checkout.Session;
        const email =
          sess.customer_details?.email ??
          (sess.metadata as Record<string, string> | null)?.user_email ??
          null;
        if (sess.customer && email) {
          await query(
            `INSERT INTO stripe_customers (user_id, stripe_customer_id)
             SELECT id, $2 FROM users WHERE email = $1
             ON CONFLICT (stripe_customer_id) DO NOTHING`,
            [email, sess.customer as string]
          );
        }
        break;
      }
    }
  } catch (e) {
    return new Response((e as Error).message, { status: 500 });
  }

  return Response.json({ received: true });
}
