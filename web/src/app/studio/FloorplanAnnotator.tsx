"use client";

import { useRef, useState } from "react";
import {
  ROOM_LABELS,
  POINT_LABELS,
  roomLabelOf,
  pointLabelOf,
  type Annotations,
  type RoomBox,
  type PointMark,
  type RoomLabelId,
  type PointLabelId,
} from "@/lib/annotations";

/* ============================================================================
 * 户型图标注编辑器
 * 用户在真实户型图上：框选房间、点标玄关/门/窗、橡皮删除，数据使用归一化坐标。
 * ==========================================================================*/

type Tool =
  | { kind: "room"; label: RoomLabelId }
  | { kind: "point"; type: PointLabelId }
  | { kind: "erase" };

let seq = 0;
function uid() {
  seq += 1;
  return `a${Date.now().toString(36)}${seq}`;
}

const POINT_COLORS: Record<PointLabelId, string> = {
  entry: "#ff7a59",
  door: "#5aa9ff",
  window: "#57d9a3",
};
const POINT_GLYPH: Record<PointLabelId, string> = {
  entry: "玄",
  door: "门",
  window: "窗",
};

interface DragRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function FloorplanAnnotator({
  imageUrl,
  initial,
  onSave,
  onClose,
}: {
  imageUrl: string;
  initial: Annotations | null;
  onSave: (a: Annotations) => void;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>({ kind: "room", label: "living" });
  const [data, setData] = useState<Annotations>(
    initial ?? { rooms: [], points: [] }
  );
  const [drag, setDrag] = useState<DragRect | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  function toRelative(e: React.PointerEvent): { x: number; y: number } | null {
    const el = overlayRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    };
  }

  function handlePointerDown(e: React.PointerEvent) {
    const p = toRelative(e);
    if (!p) return;
    if (tool.kind === "room") {
      startRef.current = p;
      setDrag({ x: p.x, y: p.y, w: 0, h: 0 });
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } else if (tool.kind === "point") {
      const mark: PointMark = { id: uid(), type: tool.type, x: p.x, y: p.y };
      setData((d) => ({ ...d, points: [...d.points, mark] }));
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!startRef.current || tool.kind !== "room") return;
    const p = toRelative(e);
    if (!p) return;
    const s = startRef.current;
    setDrag({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    });
  }

  function handlePointerUp() {
    if (tool.kind === "room" && drag && startRef.current) {
      // 过滤误触（小于 2% 视为点击，不建框）
      if (drag.w > 0.02 && drag.h > 0.02) {
        const box: RoomBox = {
          id: uid(),
          label: tool.label,
          x: drag.x,
          y: drag.y,
          w: drag.w,
          h: drag.h,
        };
        setData((d) => ({ ...d, rooms: [...d.rooms, box] }));
      }
    }
    startRef.current = null;
    setDrag(null);
  }

  function eraseRoom(id: string) {
    setData((d) => ({ ...d, rooms: d.rooms.filter((r) => r.id !== id) }));
  }
  function erasePoint(id: string) {
    setData((d) => ({ ...d, points: d.points.filter((p) => p.id !== id) }));
  }

  const eraseMode = tool.kind === "erase";
  const total = data.rooms.length + data.points.length;

  return (
    <div className="anno-backdrop" role="dialog" aria-modal="true">
      <div className="anno-modal">
        <div className="anno-head">
          <strong>标注户型图</strong>
          <button className="anno-close" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="anno-toolbar">
          <div className="anno-tool-group">
            <span className="anno-tool-title">框选房间</span>
            <div className="anno-chips">
              {ROOM_LABELS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`anno-chip${
                    tool.kind === "room" && tool.label === r.id ? " active" : ""
                  }`}
                  onClick={() => setTool({ kind: "room", label: r.id })}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="anno-tool-group">
            <span className="anno-tool-title">点位标记</span>
            <div className="anno-chips">
              {POINT_LABELS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`anno-chip point-${p.id}${
                    tool.kind === "point" && tool.type === p.id ? " active" : ""
                  }`}
                  onClick={() => setTool({ kind: "point", type: p.id })}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                className={`anno-chip erase${eraseMode ? " active" : ""}`}
                onClick={() => setTool({ kind: "erase" })}
              >
                橡皮
              </button>
            </div>
          </div>
        </div>

        <p className="anno-tip">
          {tool.kind === "room" &&
            `在图上按住拖拽，框出「${roomLabelOf(tool.label)}」区域`}
          {tool.kind === "point" &&
            `在图上点击，标记「${pointLabelOf(tool.type)}」位置`}
          {eraseMode && "点击任意标注（房间框或点位）即可删除"}
        </p>

        <div className="anno-canvas-wrap">
          <div className="anno-canvas">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="待标注户型图" className="anno-img" draggable={false} />
            <div
              ref={overlayRef}
              className={`anno-overlay${eraseMode ? " erase" : ""}${
                tool.kind === "room" ? " draw-room" : ""
              }${tool.kind === "point" ? " draw-point" : ""}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              {data.rooms.map((r) => (
                <div
                  key={r.id}
                  className="anno-room"
                  style={{
                    left: `${r.x * 100}%`,
                    top: `${r.y * 100}%`,
                    width: `${r.w * 100}%`,
                    height: `${r.h * 100}%`,
                  }}
                  onPointerDown={(e) => {
                    if (eraseMode) {
                      e.stopPropagation();
                      eraseRoom(r.id);
                    }
                  }}
                >
                  <span className="anno-room-label">{roomLabelOf(r.label)}</span>
                </div>
              ))}
              {data.points.map((p) => (
                <div
                  key={p.id}
                  className="anno-point"
                  style={{
                    left: `${p.x * 100}%`,
                    top: `${p.y * 100}%`,
                    background: POINT_COLORS[p.type],
                  }}
                  onPointerDown={(e) => {
                    if (eraseMode) {
                      e.stopPropagation();
                      erasePoint(p.id);
                    }
                  }}
                >
                  {POINT_GLYPH[p.type]}
                </div>
              ))}
              {drag && (
                <div
                  className="anno-room dragging"
                  style={{
                    left: `${drag.x * 100}%`,
                    top: `${drag.y * 100}%`,
                    width: `${drag.w * 100}%`,
                    height: `${drag.h * 100}%`,
                  }}
                />
              )}
            </div>
          </div>

          {total > 0 && (
            <div className="anno-list">
              <div className="anno-list-head">
                <span>已标注 {total} 项</span>
                <button
                  type="button"
                  className="anno-clear"
                  onClick={() => setData({ rooms: [], points: [] })}
                >
                  全部清空
                </button>
              </div>
              <ul>
                {data.rooms.map((r) => (
                  <li key={r.id}>
                    <span className="anno-list-name">▭ {roomLabelOf(r.label)}</span>
                    <button type="button" onClick={() => eraseRoom(r.id)}>
                      删除
                    </button>
                  </li>
                ))}
                {data.points.map((p) => (
                  <li key={p.id}>
                    <span className="anno-list-name">
                      <i
                        className="anno-dot"
                        style={{ background: POINT_COLORS[p.type] }}
                      />
                      {pointLabelOf(p.type)}
                    </span>
                    <button type="button" onClick={() => erasePoint(p.id)}>
                      删除
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="anno-foot">
          <button type="button" className="btn ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => onSave(data)}
          >
            保存标注{total > 0 ? `（${total} 项）` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 只读标注层：用于方案详情中回显用户标注（坐标同为归一化比例）
 * ==========================================================================*/
export function AnnotationsLayer({ data }: { data: Annotations }) {
  return (
    <div className="anno-layer" aria-hidden>
      {data.rooms.map((r) => (
        <div
          key={r.id}
          className="anno-room readonly"
          style={{
            left: `${r.x * 100}%`,
            top: `${r.y * 100}%`,
            width: `${r.w * 100}%`,
            height: `${r.h * 100}%`,
          }}
        >
          <span className="anno-room-label">{roomLabelOf(r.label)}</span>
        </div>
      ))}
      {data.points.map((p) => (
        <div
          key={p.id}
          className="anno-point readonly"
          style={{
            left: `${p.x * 100}%`,
            top: `${p.y * 100}%`,
            background: POINT_COLORS[p.type],
          }}
        >
          {POINT_GLYPH[p.type]}
        </div>
      ))}
    </div>
  );
}
