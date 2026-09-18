import { listGenerations, isMockMode, type GenerationRow } from "@/lib/generations";
import StudioClient from "./StudioClient";

export const metadata = { title: "AI 家居设计工作台 · aifurniture.lol" };
export const dynamic = "force-dynamic";

export default async function StudioPage() {
  let initial: GenerationRow[] = [];
  try {
    initial = await listGenerations({ limit: 24 });
  } catch {
    // 数据库未就绪时以空列表启动，提交时接口会返回 503 提示
  }
  return <StudioClient initial={initial} mock={isMockMode()} />;
}
