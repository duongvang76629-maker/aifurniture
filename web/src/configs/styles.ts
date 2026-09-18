/* ============================================================================
 * 设计风格预设（无 Node 依赖，可安全用于客户端组件）
 * label 用于页面展示，prompt 片段用于真实模型与 mock 图描述
 * ==========================================================================*/
export const STYLE_PRESETS = [
  { id: "nordic", label: "北欧", prompt: "Nordic Scandinavian interior, light oak wood, white and beige tones" },
  { id: "japanese", label: "日式", prompt: "Japanese muji interior, natural wood, tatami, minimalist" },
  { id: "modern", label: "现代简约", prompt: "modern minimalist interior, clean lines, neutral colors" },
  { id: "industrial", label: "工业风", prompt: "industrial loft interior, exposed brick, concrete, metal" },
  { id: "luxury", label: "轻奢", prompt: "modern luxury interior, marble, brass accents, elegant" },
  { id: "chinese", label: "新中式", prompt: "modern Chinese interior, oriental furniture, ink tones" },
] as const;

export type StyleId = (typeof STYLE_PRESETS)[number]["id"];
