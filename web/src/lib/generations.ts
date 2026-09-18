/* ============================================================================
 * 空间方案生成：业务逻辑层
 * Mock 开启：任务落库后直接成功，成品图由图像生成服务实时返回；
 * Mock 关闭：调 Replicate 发起预测，结果由 webhook 回写（既有链路不变）。
 * ==========================================================================*/
import { query } from "@/lib/db";
import { startGeneration } from "@/lib/replicate";
import { STYLE_PRESETS } from "@/configs/styles";

export { STYLE_PRESETS } from "@/configs/styles";

/** 输入校验错误（路由据此返回 400，区别于 500） */
export class ValidationError extends Error {}

export type GenerationStatus = "queued" | "processing" | "succeeded" | "failed";

export interface GenerationRow {
  id: string;
  user_id: string | null;
  prompt: string;
  prompt_en: string | null;
  status: GenerationStatus;
  image_url: string | null;
  error: string | null;
  created_at: string;
}

const RETURN_COLUMNS =
  "id, user_id, prompt, prompt_en, status, image_url, error, to_char(created_at, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') AS created_at";

const MOCK_IMAGE_ENDPOINT =
  "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image";

export function isMockMode(): boolean {
  return process.env.MOCK_SERVICES === "true";
}

export interface CreateGenerationInput {
  prompt: string;
  style?: string;
  userId?: string | null;
}

export async function createGeneration({
  prompt,
  style,
  userId,
}: CreateGenerationInput): Promise<GenerationRow> {
  const clean = prompt.trim();
  if (!clean) throw new ValidationError("请输入空间描述");
  if (clean.length > 1000) {
    throw new ValidationError("描述过长，最多 1000 字");
  }
  const preset = STYLE_PRESETS.find((s) => s.id === style);

  // 1. 先落库 queued
  const inserted = await query<GenerationRow>(
    `INSERT INTO generations (user_id, prompt, status)
     VALUES ($1, $2, 'queued')
     RETURNING ${RETURN_COLUMNS}`,
    [userId ?? null, clean]
  );
  const row = inserted.rows[0];

  // 2a. Mock 模式：直接构造成品图并置 succeeded
  if (isMockMode()) {
    const imagePrompt =
      `photorealistic interior design rendering, ${preset ? preset.label + " style, " : ""}` +
      `${clean}, professional architecture visualization, warm natural lighting`;
    const imageUrl =
      `${MOCK_IMAGE_ENDPOINT}?prompt=${encodeURIComponent(imagePrompt)}` +
      `&image_size=landscape_4_3`;
    const updated = await query<GenerationRow>(
      `UPDATE generations
         SET status = 'succeeded',
             image_url = $2,
             prompt_en = $3,
             updated_at = now()
       WHERE id = $1
       RETURNING ${RETURN_COLUMNS}`,
      [row.id, imageUrl, imagePrompt]
    );
    return updated.rows[0];
  }

  // 2b. 真实链路：发起 Replicate 预测，等待 webhook 回写
  try {
    const englishPrompt = preset ? `${preset.prompt}, ${clean}` : clean;
    const prediction = await startGeneration({ prompt: englishPrompt });
    const updated = await query<GenerationRow>(
      `UPDATE generations
         SET status = 'processing',
             replicate_id = $2,
             prompt_en = $3,
             updated_at = now()
       WHERE id = $1
       RETURNING ${RETURN_COLUMNS}`,
      [row.id, prediction.id, englishPrompt]
    );
    return updated.rows[0];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const failed = await query<GenerationRow>(
      `UPDATE generations
         SET status = 'failed',
             error = $2,
             updated_at = now()
       WHERE id = $1
       RETURNING ${RETURN_COLUMNS}`,
      [row.id, message]
    );
    return failed.rows[0];
  }
}

export interface ListGenerationsInput {
  userId?: string | null;
  limit?: number;
}

export async function listGenerations({
  userId,
  limit = 24,
}: ListGenerationsInput): Promise<GenerationRow[]> {
  const safeLimit = Math.min(Math.max(Number(limit) || 24, 1), 60);
  if (userId) {
    const r = await query<GenerationRow>(
      `SELECT ${RETURN_COLUMNS}
         FROM generations
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [userId, safeLimit]
    );
    return r.rows;
  }
  // 未登录：返回最近的匿名任务（公开试用）
  const r = await query<GenerationRow>(
    `SELECT ${RETURN_COLUMNS}
       FROM generations
      WHERE user_id IS NULL
      ORDER BY created_at DESC
      LIMIT $1`,
    [safeLimit]
  );
  return r.rows;
}
