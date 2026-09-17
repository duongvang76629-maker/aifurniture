/* ============================================================================
 * 定时翻译任务（Vercel Cron 每分钟调用，见 vercel.json）
 * 鉴权：Authorization: Bearer <CRON_SECRET>
 * 把方案文本翻译为其他语言；翻译提供商需自行接入（见 translateText）。
 * ==========================================================================*/
import { query } from "@/lib/db";

interface PendingJob {
  id: string;
  source_text: string;
  target_lang: string;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "cron not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("forbidden", { status: 403 });
  }

  const locked = await query<PendingJob>(
    `UPDATE translation_jobs
       SET status = 'processing', updated_at = now()
     WHERE id IN (
       SELECT id FROM translation_jobs
        WHERE status = 'pending'
        ORDER BY created_at
        LIMIT 10
        FOR UPDATE SKIP LOCKED
     )
     RETURNING id, source_text, target_lang`
  );

  const processed: string[] = [];
  for (const job of locked.rows) {
    try {
      const translated = await translateText(job.source_text, job.target_lang);
      await query(
        "UPDATE translation_jobs SET status = 'done', result = $2, updated_at = now() WHERE id = $1",
        [job.id, translated]
      );
      processed.push(job.id);
    } catch {
      // 翻译未就绪：放回队列等下一轮
      await query(
        "UPDATE translation_jobs SET status = 'pending', updated_at = now() WHERE id = $1",
        [job.id]
      );
    }
  }

  return Response.json({ processed: processed.length });
}

/** TODO: 接入翻译能力（Google Translate / 自研 LLM）。未接入前始终抛错。 */
async function translateText(_text: string, _targetLang: string): Promise<string> {
  throw new Error("translate provider not configured");
}
