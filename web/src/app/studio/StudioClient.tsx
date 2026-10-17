"use client";

import { useEffect, useState } from "react";
import { STYLE_PRESETS } from "@/configs/styles";
import type { GenerationRow } from "@/lib/generations";
import {
  parseAnnotations,
  hasAnnotations,
  summarizeAnnotationsZh,
  type Annotations,
} from "@/lib/annotations";
import FloorplanAnnotator, {
  AnnotationsLayer,
} from "./FloorplanAnnotator";

export default function StudioClient({
  initial,
  mock,
}: {
  initial: GenerationRow[];
  mock: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<string>(STYLE_PRESETS[0].id);
  const [items, setItems] = useState<GenerationRow[]>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GenerationRow | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotations | null>(null);
  const [annotatorOpen, setAnnotatorOpen] = useState(false);

  const canSubmit = (prompt.trim().length > 0 || selectedFile) && !submitting;

  // 是否有未完成任务 → 启动轮询让 processing/queued → succeeded 自动更新
  const hasPending = items.some(
    (g) => g.status === "processing" || g.status === "queued"
  );

  useEffect(() => {
    if (!hasPending) return;
    let cancelled = false;
    const t = setInterval(async () => {
      try {
        const res = await fetch("/api/generations?limit=60", {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled || !res.ok) return;
        const fresh = data.generations as GenerationRow[];
        setItems((prev) =>
          prev.map((g) => fresh.find((f) => f.id === g.id) ?? g)
        );
      } catch {
        /* 网络抖动忽略，下一轮重试 */
      }
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [hasPending]);

  // Esc 关闭模态
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  // 模态中选中项跟随 items 更新（轮询后状态变化同步）
  useEffect(() => {
    if (!selected) return;
    const fresh = items.find((g) => g.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [items, selected]);

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      let res: Response;
      if (selectedFile) {
        const formData = new FormData();
        formData.append("prompt", prompt.trim());
        formData.append("style", style);
        formData.append("image", selectedFile);
        if (annotations && hasAnnotations(annotations)) {
          formData.append("annotations", JSON.stringify(annotations));
        }
        res = await fetch("/api/generations", {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch("/api/generations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, style }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `请求失败（${res.status}）`);
      setItems((prev) => [data.generation as GenerationRow, ...prev]);
      setPrompt("");
      setSelectedFile(null);
      setPreviewUrl(null);
      setAnnotations(null);
      setAnnotatorOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setAnnotations(null);
  }

  function removeFile() {
    setSelectedFile(null);
    setPreviewUrl(null);
    setAnnotations(null);
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setAnnotations(null);
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
  }

  async function handleDownload() {
    if (!selected?.image_url) return;
    setDownloading(true);
    try {
      // 跨域图尝试 fetch 成 blob 后触发下载；失败则在新窗口打开
      const res = await fetch(selected.image_url);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aifurniture-${selected.id.slice(0, 8)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(selected.image_url, "_blank", "noopener");
    } finally {
      setDownloading(false);
    }
  }

  function formatTime(s: string) {
    try {
      const iso = s.endsWith("Z") ? s : s + "Z";
      return new Date(iso).toLocaleString("zh-CN", { hour12: false });
    } catch {
      return s;
    }
  }

  function onCardKey(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      (e.currentTarget as HTMLElement).click();
    }
  }

  return (
    <main className="studio">
      <header className="studio-top">
        <a href="/studio" className="brand">
          <span className="mark">AI</span>
          <strong>aifurniture.lol</strong>
        </a>
        <nav className="studio-nav">
          {mock && <span className="mock-badge">Mock 模式</span>}
          <a href="/config">配置</a>
          <span className="login-disabled" title="登录功能即将开放，当前可免登录试用全部功能">
            登录
          </span>
        </nav>
      </header>

      <section className="composer">
        <h1>描述你想要的家</h1>
        <p className="composer-hint">
          用一句话描述空间与需求，AI 将生成对应的室内设计效果图
        </p>

        <div className="styles" role="radiogroup" aria-label="设计风格">
          {STYLE_PRESETS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={style === s.id}
              className={`style-chip${style === s.id ? " active" : ""}`}
              onClick={() => setStyle(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <textarea
          className="prompt-box"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={1000}
          rows={4}
          placeholder="例如：15 平米的小客厅，想要温馨明亮、收纳充足，有一张三人沙发和投影仪……"
        />

        <div className="floorplan-upload">
          <label
            className={`upload-label${previewUrl ? " has-file" : ""}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <input
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="upload-input"
            />
            {previewUrl ? (
              <div className="upload-preview">
                <img src={previewUrl} alt="户型图预览" />
                <div className="upload-info">
                  <span className="upload-filename">
                    {selectedFile?.name || "户型图"}
                  </span>
                  <button
                    type="button"
                    className={`upload-annotate-btn${
                      annotations && hasAnnotations(annotations) ? " done" : ""
                    }`}
                    onClick={(e) => {
                      e.preventDefault();
                      setAnnotatorOpen(true);
                    }}
                  >
                    {annotations && hasAnnotations(annotations)
                      ? `✓ 已标注（${
                          annotations.rooms.length + annotations.points.length
                        } 项）· 修改`
                      : "标注户型"}
                  </button>
                </div>
                <button
                  type="button"
                  className="upload-remove"
                  onClick={(e) => {
                    e.preventDefault();
                    removeFile();
                  }}
                  aria-label="移除图片"
                >
                  ×
                </button>
              </div>
            ) : (
              <div className="upload-placeholder">
                <span className="upload-icon">+</span>
                <span className="upload-text">上传户型图（可选）</span>
                <span className="upload-hint">支持 JPG / PNG / WebP，最大 10MB</span>
              </div>
            )}
          </label>
        </div>

        <div className="composer-foot">
          <span className="form-error">{error}</span>
          <button
            type="button"
            className="btn primary"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {submitting ? "生成中…" : "生成方案"}
          </button>
        </div>
      </section>

      <section className="gallery-head">
        <h2>最近方案</h2>
      </section>

      {items.length === 0 ? (
        <p className="empty">还没有方案，输入描述生成第一张效果图吧。</p>
      ) : (
        <section className="grid">
          {items.map((g) => (
            <article
              className="card"
              key={g.id}
              tabIndex={0}
              role="button"
              onClick={() => setSelected(g)}
              onKeyDown={onCardKey}
            >
              {g.status === "succeeded" && g.image_url ? (
                <img src={g.image_url} alt={g.prompt} loading="lazy" />
              ) : g.status === "failed" ? (
                <div className="card-failed">
                  生成失败
                  <span className="card-failed-reason">{g.error}</span>
                </div>
              ) : (
                <div className="card-pending">
                  <span className="spinner" />
                  {g.status === "processing" ? "渲染中…" : "排队中…"}
                </div>
              )}
              <div className="card-body">
                <p>{g.prompt}</p>
              </div>
            </article>
          ))}
        </section>
      )}

      {selected && (
        <div
          className="modal-backdrop"
          onClick={() => setSelected(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              aria-label="关闭"
              onClick={() => setSelected(null)}
            >
              ×
            </button>
            {selected.status === "succeeded" && selected.image_url ? (
              <img
                className="modal-img"
                src={selected.image_url}
                alt={selected.prompt}
              />
            ) : selected.status === "failed" ? (
              <div className="modal-pending">
                生成失败
                <span className="modal-reason">{selected.error}</span>
              </div>
            ) : (
              <div className="modal-pending">
                <span className="spinner" />
                {selected.status === "processing" ? "渲染中…" : "排队中…"}
              </div>
            )}
            <div className="modal-body">
              <p className="modal-prompt">{selected.prompt}</p>
              {selected.source_image_url && (
                <div className="modal-source">
                  <span className="modal-source-label">
                    户型图{hasAnnotations(parseAnnotations(selected.annotations))
                      ? "（含标注）"
                      : ""}：
                  </span>
                  <div className="anno-wrap">
                    <a
                      href={selected.source_image_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selected.source_image_url}
                        alt="户型图"
                        className="modal-source-img"
                      />
                    </a>
                    {(() => {
                      const a = parseAnnotations(selected.annotations);
                      return a && hasAnnotations(a) ? (
                        <>
                          <AnnotationsLayer data={a} />
                          <p className="modal-anno-summary">
                            {summarizeAnnotationsZh(a)}
                          </p>
                        </>
                      ) : null;
                    })()}
                  </div>
                </div>
              )}
              <div className="modal-meta">
                <span>状态：{selected.status}</span>
                {selected.prompt_en && (
                  <span>EN：{selected.prompt_en}</span>
                )}
                <span>创建：{formatTime(selected.created_at)}</span>
              </div>
              <div className="modal-actions">
                {selected.image_url && (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={handleDownload}
                    disabled={downloading}
                  >
                    {downloading ? "下载中…" : "下载图片"}
                  </button>
                )}
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setSelected(null)}
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {annotatorOpen && previewUrl && (
        <FloorplanAnnotator
          imageUrl={previewUrl}
          initial={annotations}
          onSave={(a) => {
            setAnnotations(a);
            setAnnotatorOpen(false);
          }}
          onClose={() => setAnnotatorOpen(false)}
        />
      )}
    </main>
  );
}
