/* ============================================================================
 * Replicate 回调：接收渲染结果 → 下载成品图 → 存入 R2 → 更新 generations
 * 本地调试时 REPLICATE_WEBHOOK_URL 必须是 ngrok 公网地址。
 * ==========================================================================*/
import { query } from "@/lib/db";
import { uploadToR2, r2PublicUrl } from "@/lib/r2";

interface ReplicatePrediction {
  id: string;
  status: string;
  output?: string | string[] | null;
  error?: string | null;
}

export async function POST(req: Request) {
  // 可选回调密钥：Authorization: Bearer <secret> 或 URL ?secret=<secret>
  const expected = process.env.REPLICATE_WEBHOOK_SECRET;
  if (expected) {
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const fromQuery = new URL(req.url).searchParams.get("secret");
    if (bearer !== expected && fromQuery !== expected) {
      return new Response("forbidden", { status: 403 });
    }
  }

  const prediction = (await req.json()) as ReplicatePrediction;

  if (prediction.status === "succeeded") {
    const remote = Array.isArray(prediction.output)
      ? prediction.output[0]
      : prediction.output;
    if (!remote) return Response.json({ ok: false, reason: "no output" });

    const imgRes = await fetch(remote);
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const key = `generations/${prediction.id}.png`;

    await uploadToR2(key, buf, "image/png");
    const publicUrl = r2PublicUrl(key);

    await query(
      `UPDATE generations
         SET status = 'succeeded', image_url = $2, r2_key = $3, updated_at = now()
       WHERE replicate_id = $1`,
      [prediction.id, publicUrl, key]
    );
    return Response.json({ ok: true, stored: publicUrl });
  }

  if (prediction.status === "failed") {
    await query(
      `UPDATE generations SET status = 'failed', error = $2, updated_at = now()
       WHERE replicate_id = $1`,
      [prediction.id, prediction.error ?? "generation failed"]
    );
    return Response.json({ ok: false });
  }

  // processing / 其他中间状态
  await query(
    "UPDATE generations SET status = 'processing', updated_at = now() WHERE replicate_id = $1",
    [prediction.id]
  );
  return Response.json({ ok: true });
}
