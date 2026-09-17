/* ============================================================================
 * Replicate 渲染任务（发起预测；结果经 /api/replicate/webhook 回调）
 * 本地调试必须把 REPLICATE_WEBHOOK_URL 配成 ngrok 公网地址。
 * ==========================================================================*/

export interface StartGenerationInput {
  prompt: string;
  /** 透传给模型的额外参数（尺寸等） */
  extraInput?: Record<string, unknown>;
}

export async function startGeneration({ prompt, extraInput }: StartGenerationInput) {
  const token = process.env.REPLICATE_API_TOKEN;
  const webhook = process.env.REPLICATE_WEBHOOK_URL;
  const model = process.env.REPLICATE_MODEL || "black-forest-labs/flux-schnell";
  if (!token || !webhook) {
    throw new Error("REPLICATE_API_TOKEN / REPLICATE_WEBHOOK_URL 未配置");
  }

  const [owner, name] = model.split("/");
  const res = await fetch(
    `https://api.replicate.com/v1/models/${owner}/${name}/predictions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({
        input: { prompt, ...extraInput },
        webhook,
        webhook_events_filter: ["completed"],
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`Replicate 发起失败 ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as { id: string; status: string; output?: unknown };
}
