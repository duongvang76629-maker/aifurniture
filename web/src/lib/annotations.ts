/* ============================================================================
 * 户型图标注：共享类型与工具（无 Node 依赖，客户端/服务端均可使用）
 * 坐标全部使用相对于图片左上角的归一化比例（0~1），与显示尺寸解耦。
 * ==========================================================================*/

/** 可标注的房间类型 */
export const ROOM_LABELS = [
  { id: "living", label: "客厅" },
  { id: "bedroom", label: "卧室" },
  { id: "kitchen", label: "厨房" },
  { id: "dining", label: "餐厅" },
  { id: "study", label: "书房" },
  { id: "bathroom", label: "卫生间" },
  { id: "balcony", label: "阳台" },
  { id: "closet", label: "储物间" },
] as const;

/** 点位标注类型：玄关 / 门 / 窗 */
export const POINT_LABELS = [
  { id: "entry", label: "玄关" },
  { id: "door", label: "门" },
  { id: "window", label: "窗" },
] as const;

export type RoomLabelId = (typeof ROOM_LABELS)[number]["id"];
export type PointLabelId = (typeof POINT_LABELS)[number]["id"];

/** 房间框：x/y 为左上角，w/h 为宽高（均为 0~1 比例） */
export interface RoomBox {
  id: string;
  label: RoomLabelId;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 点位标注：玄关/门/窗 */
export interface PointMark {
  id: string;
  type: PointLabelId;
  x: number;
  y: number;
}

export interface Annotations {
  rooms: RoomBox[];
  points: PointMark[];
}

export const EMPTY_ANNOTATIONS: Annotations = { rooms: [], points: [] };

const ROOM_LABEL_MAP = new Map(ROOM_LABELS.map((r) => [r.id, r.label]));
const POINT_LABEL_MAP = new Map(POINT_LABELS.map((p) => [p.id, p.label]));

const ROOM_EN: Record<string, string> = {
  living: "living room",
  bedroom: "bedroom",
  kitchen: "kitchen",
  dining: "dining room",
  study: "study room",
  bathroom: "bathroom",
  balcony: "balcony",
  closet: "storage room",
};

/** 安全解析标注 JSON；非法/空值返回 null */
export function parseAnnotations(
  raw: string | null | undefined
): Annotations | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<Annotations>;
    if (!Array.isArray(data.rooms) && !Array.isArray(data.points)) return null;
    return {
      rooms: Array.isArray(data.rooms) ? data.rooms : [],
      points: Array.isArray(data.points) ? data.points : [],
    };
  } catch {
    return null;
  }
}

/** 标注是否为空 */
export function hasAnnotations(a: Annotations | null | undefined): boolean {
  return !!a && (a.rooms.length > 0 || a.points.length > 0);
}

/** 方位描述：把归一化坐标转成 上/下/左/右/中 等粗略方位词 */
function zoneOf(x: number, y: number): string {
  const vertical = y < 0.33 ? "上" : y > 0.66 ? "下" : "中";
  const horizontal = x < 0.33 ? "左" : x > 0.66 ? "右" : "";
  if (vertical === "中" && horizontal === "") return "中部";
  return `${vertical}${horizontal}部`;
}

/** 生成中文布局摘要（用于 mock 记录与展示） */
export function summarizeAnnotationsZh(a: Annotations): string {
  const parts: string[] = [];
  if (a.rooms.length > 0) {
    const roomText = a.rooms
      .map((r) => `${ROOM_LABEL_MAP.get(r.label) ?? r.label}（图${zoneOf(r.x + r.w / 2, r.y + r.h / 2)}）`)
      .join("、");
    parts.push(`房间标注：${roomText}`);
  }
  const entry = a.points.find((p) => p.type === "entry");
  if (entry) parts.push(`玄关位于图${zoneOf(entry.x, entry.y)}`);
  const doors = a.points.filter((p) => p.type === "door");
  if (doors.length > 0) parts.push(`门 ×${doors.length}`);
  const windows = a.points.filter((p) => p.type === "window");
  if (windows.length > 0) parts.push(`窗 ×${windows.length}`);
  return parts.join("；");
}

/** 生成英文布局提示（拼接进真实模型 prompt，帮助模型理解户型结构） */
export function summarizeAnnotationsEn(a: Annotations): string {
  const parts: string[] = [];
  if (a.rooms.length > 0) {
    const roomText = a.rooms
      .map((r) => {
        const name = ROOM_EN[r.label] ?? r.label;
        return `${name} at ${zoneEn(r.x + r.w / 2, r.y + r.h / 2)} area`;
      })
      .join("; ");
    parts.push(`floor plan layout: ${roomText}`);
  }
  const entry = a.points.find((p) => p.type === "entry");
  if (entry) {
    parts.push(`entryway/foyer located at ${zoneEn(entry.x, entry.y)} side`);
  }
  const doors = a.points.filter((p) => p.type === "door").length;
  const windows = a.points.filter((p) => p.type === "window").length;
  if (doors > 0) parts.push(`${doors} interior door${doors > 1 ? "s" : ""} marked`);
  if (windows > 0) parts.push(`${windows} window${windows > 1 ? "s" : ""} marked`);
  parts.push("respect the marked room positions and entryway, do not relocate them");
  return parts.join(". ") + ".";
}

function zoneEn(x: number, y: number): string {
  const v = y < 0.33 ? "top" : y > 0.66 ? "bottom" : "center";
  const h = x < 0.33 ? "-left" : x > 0.66 ? "-right" : "";
  return v + h;
}

export function roomLabelOf(id: string): string {
  return ROOM_LABEL_MAP.get(id as RoomLabelId) ?? id;
}

export function pointLabelOf(id: string): string {
  return POINT_LABEL_MAP.get(id as PointLabelId) ?? id;
}
