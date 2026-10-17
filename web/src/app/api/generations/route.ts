/* ============================================================================
 * 空间方案生成接口
 *   POST /api/generations   创建生成任务（mock 下立即返回效果图）
 *   GET  /api/generations   最近任务列表
 * 已登录按用户过滤；未登录使用匿名试用通道（user_id 为空）。
 * POST 支持 JSON 与 multipart/form-data（含户型图上传）。
 * ==========================================================================*/
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { uploadToR2, r2PublicUrl } from "@/lib/r2";
import {
  createGeneration,
  listGenerations,
  isMockMode,
  ValidationError,
} from "@/lib/generations";

/** 从会话解析用户在 users 表中的 id；查不到时按匿名处理 */
async function resolveUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return null;
  const r = await query<{ id: string }>(
    "SELECT id FROM users WHERE email = $1",
    [email]
  );
  return r.rows[0]?.id ?? null;
}

/** 把上传的户型图写入 R2，返回公开访问 URL */
async function uploadFloorplan(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const ext = file.name.split(".").pop() || "png";
  const key = `floorplan/${crypto.randomUUID()}.${ext}`;
  await uploadToR2(key, Buffer.from(bytes), file.type || "image/png");
  return r2PublicUrl(key);
}

export async function POST(req: Request) {
  let userId: string | null = null;
  try {
    userId = await resolveUserId();

    let prompt = "";
    let style: string | undefined;
    let sourceImageUrl: string | null = null;

    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      prompt = (formData.get("prompt") as string) ?? "";
      style = (formData.get("style") as string) ?? undefined;
      const image = formData.get("image") as File | null;
      if (image && image.size > 0) {
        if (image.size > 10 * 1024 * 1024) {
          return NextResponse.json(
            { error: "图片大小不能超过 10MB" },
            { status: 400 }
          );
        }
        sourceImageUrl = await uploadFloorplan(image);
      }
    } else {
      const body = (await req.json().catch(() => ({}))) as {
        prompt?: unknown;
        style?: unknown;
        sourceImageUrl?: unknown;
      };
      prompt = typeof body.prompt === "string" ? body.prompt : "";
      style = typeof body.style === "string" ? body.style : undefined;
      sourceImageUrl =
        typeof body.sourceImageUrl === "string" ? body.sourceImageUrl : null;
    }

    const generation = await createGeneration({
      prompt,
      style,
      userId,
      sourceImageUrl,
    });
    return NextResponse.json(
      { generation, mock: isMockMode() },
      { status: generation.status === "failed" ? 502 : 201 }
    );
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : "internal error";
    const status = /DATABASE_URL/.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(req: Request) {
  try {
    const userId = await resolveUserId();
    const url = new URL(req.url);
    const limitParam = url.searchParams.get("limit");
    const generations = await listGenerations({
      userId,
      limit: limitParam ? Number(limitParam) : undefined,
    });
    return NextResponse.json({ generations, mock: isMockMode() });
  } catch (e) {
    const message = e instanceof Error ? e.message : "internal error";
    const status = /DATABASE_URL/.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
