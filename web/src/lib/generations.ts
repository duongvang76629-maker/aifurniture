/* ============================================================================
 * 空间方案生成：业务逻辑层
 * Mock 开启：任务落库后直接成功，成品图由图像生成服务实时返回；
 * Mock 关闭：调 Replicate 发起预测，结果由 webhook 回写（既有链路不变）。
 * ==========================================================================*/
import { query } from "@/lib/db";
import { startGeneration } from "@/lib/replicate";
import { STYLE_PRESETS } from "@/configs/styles";
import {
  parseAnnotations,
  summarizeAnnotationsEn,
  summarizeAnnotationsZh,
  hasAnnotations,
} from "@/lib/annotations";

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
  source_image_url: string | null;
  annotations: string | null;
  error: string | null;
  created_at: string;
}

const RETURN_COLUMNS =
  "id, user_id, prompt, prompt_en, status, image_url, source_image_url, annotations, error, to_char(created_at, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') AS created_at";

/** 房间类型关键词映射：按优先级排序，先匹配先返回 */
const ROOM_KEYWORDS: Array<{ room: string; pattern: RegExp }> = [
  { room: "bedroom", pattern: /卧室|主卧|次卧|bedroom/i },
  { room: "kitchen", pattern: /厨房|橱柜|kitchen/i },
  { room: "dining", pattern: /餐厅|饭厅|dining/i },
  { room: "study", pattern: /书房|办公|study/i },
  { room: "bathroom", pattern: /卫生间|浴室|洗手间|卫浴|bathroom/i },
  { room: "living", pattern: /客厅|起居室|living/i },
];

/** 从用户提示词中识别房间类型，默认客厅 */
function detectRoom(prompt: string): string {
  for (const { room, pattern } of ROOM_KEYWORDS) {
    if (pattern.test(prompt)) return room;
  }
  return "living";
}

/** Mock 模式成品图：public/mock/{style}/{room}.jpg，按风格+房间映射 */
function mockImageUrl(
  style?: string,
  prompt?: string,
  annotations?: ReturnType<typeof parseAnnotations>
): string {
  const preset = STYLE_PRESETS.find((s) => s.id === style);
  const text = prompt ?? "";
  const matchedInText = ROOM_KEYWORDS.some((k) => k.pattern.test(text));
  let room = detectRoom(text);
  // 文字没有明确房间词时，退回到户型图标注里的第一个可出图房间
  if (!matchedInText && annotations) {
    const labeled = annotations.rooms.find((r) =>
      ["living", "bedroom", "kitchen", "dining", "study", "bathroom"].includes(r.label)
    );
    if (labeled) room = labeled.label;
  }
  return `/mock/${preset ? preset.id : "modern"}/${room}.jpg`;
}

export function isMockMode(): boolean {
  return process.env.MOCK_SERVICES === "true";
}

export interface CreateGenerationInput {
  prompt: string;
  style?: string;
  userId?: string | null;
  sourceImageUrl?: string | null;
  /** 户型图标注 JSON 字符串 */
  annotations?: string | null;
}

export async function createGeneration({
  prompt,
  style,
  userId,
  sourceImageUrl,
  annotations,
}: CreateGenerationInput): Promise<GenerationRow> {
  const clean = prompt.trim();
  if (!clean && !sourceImageUrl) throw new ValidationError("请输入空间描述或上传户型图");
  if (clean.length > 1000) {
    throw new ValidationError("描述过长，最多 1000 字");
  }
  if (annotations && annotations.length > 50000) {
    throw new ValidationError("标注数据过大");
  }
  const preset = STYLE_PRESETS.find((s) => s.id === style);
  const marked = parseAnnotations(annotations);

  // 1. 先落库 queued
  const inserted = await query<GenerationRow>(
    `INSERT INTO generations (user_id, prompt, status, source_image_url, annotations)
     VALUES ($1, $2, 'queued', $3, $4)
     RETURNING ${RETURN_COLUMNS}`,
    [userId ?? null, clean, sourceImageUrl ?? null, hasAnnotations(marked) ? annotations : null]
  );
  const row = inserted.rows[0];

  // 2a. Mock 模式：直接构造成品图并置 succeeded
  if (isMockMode()) {
    const zhLayout = marked && hasAnnotations(marked) ? `；${summarizeAnnotationsZh(marked)}` : "";
    const imagePrompt =
      `photorealistic interior design rendering, ${preset ? preset.label + " style, " : ""}` +
      `${clean}${zhLayout}, professional architecture visualization, warm natural lighting`;
    const imageUrl = mockImageUrl(style, clean, marked);
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
    let englishPrompt = preset ? `${preset.prompt}, ${clean}` : clean;
    if (marked && hasAnnotations(marked)) {
      englishPrompt = `${englishPrompt}. ${summarizeAnnotationsEn(marked)}`;
    }
    const extraInput: Record<string, unknown> = {};
    if (sourceImageUrl) {
      extraInput.image = sourceImageUrl;
    }
    const prediction = await startGeneration({
      prompt: englishPrompt,
      extraInput: Object.keys(extraInput).length > 0 ? extraInput : undefined,
    });
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
