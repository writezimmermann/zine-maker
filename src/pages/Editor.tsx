import { useCallback, useEffect, useRef, useState } from "react";
import type { PageTransform, ZinePage, ZineRecord } from "../types";
import { getImage, getZine, saveImage, saveZine } from "../lib/db";
import uuid from "../lib/id";
import { computeDuplexImposition, computeImposition, type FlipMethod } from "../lib/imposition";
import { exportZineDuplexPdf, exportZinePdfs } from "../lib/pdfExport";
import { normalizeImageOrientation } from "../lib/normalizeImage";

interface Props {
  zineId: string;
  onBack: () => void;
}

function PageFrame({
  page,
  imageUrl,
  isCover,
  onFile,
  onTransformChange,
  onRemove,
}: {
  page: ZinePage;
  imageUrl: string | null;
  isCover: boolean;
  onFile: (file: File) => void;
  onTransformChange: (t: PageTransform) => void;
  onRemove: () => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  const draggingRef = useRef<{ startX: number; startY: number; t: PageTransform } | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = page.transform;

  // Match the PDF export's "contain within a whitespace margin" fit so the
  // preview looks like the printed page: nothing is ever cropped.
  const MARGIN_RATIO_W = 10 / 148;
  const MARGIN_RATIO_H = 10 / 210;

  let imgStyle: React.CSSProperties = {};
  if (imageUrl && naturalSize && frameRef.current) {
    const frameW = frameRef.current.clientWidth;
    const frameH = frameRef.current.clientHeight;
    const availW = frameW * (1 - 2 * MARGIN_RATIO_W);
    const availH = frameH * (1 - 2 * MARGIN_RATIO_H);
    const rotatedQuarter = t.rotation === 90 || t.rotation === 270;
    const effW = rotatedQuarter ? naturalSize.h : naturalSize.w;
    const effH = rotatedQuarter ? naturalSize.w : naturalSize.h;
    const containScale = Math.min(availW / effW, availH / effH) * t.scale;
    const drawW = naturalSize.w * containScale;
    const drawH = naturalSize.h * containScale;
    const centerX = frameW * t.offsetX;
    const centerY = frameH * t.offsetY;
    imgStyle = {
      width: drawW,
      height: drawH,
      left: centerX - drawW / 2,
      top: centerY - drawH / 2,
      transform: `rotate(${t.rotation}deg)`,
    };
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) onFile(file);
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (!imageUrl) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    draggingRef.current = { startX: e.clientX, startY: e.clientY, t: { ...t } };
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!draggingRef.current || !frameRef.current) return;
    const dx = e.clientX - draggingRef.current.startX;
    const dy = e.clientY - draggingRef.current.startY;
    const frameW = frameRef.current.clientWidth;
    const frameH = frameRef.current.clientHeight;
    const start = draggingRef.current.t;
    onTransformChange({
      ...t,
      offsetX: Math.min(1, Math.max(0, start.offsetX + dx / frameW)),
      offsetY: Math.min(1, Math.max(0, start.offsetY + dy / frameH)),
    });
  }

  function handlePointerUp() {
    draggingRef.current = null;
  }

  return (
    <div className="page-col">
      <div
        ref={frameRef}
        className={
          "page-frame" +
          (isCover ? " cover" : "") +
          (dragOver ? " drag-over" : "")
        }
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => {
          if (!imageUrl) fileInputRef.current?.click();
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {imageUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img
            src={imageUrl}
            style={imgStyle}
            draggable={false}
            onLoad={(e) =>
              setNaturalSize({
                w: e.currentTarget.naturalWidth,
                h: e.currentTarget.naturalHeight,
              })
            }
          />
        ) : (
          <div className="empty-hint">
            p.{page.pageNumber}
            <br />
            click or drop image
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
      </div>
      <div className="spread-label">{isCover ? "Cover" : `p.${page.pageNumber}`}</div>
      {imageUrl && (
        <div className="page-controls">
          <button
            className="icon-btn"
            onClick={() =>
              onTransformChange({
                ...t,
                rotation: ((t.rotation + 90) % 360) as 0 | 90 | 180 | 270,
              })
            }
          >
            ⟳
          </button>
          <button
            className="icon-btn"
            onClick={() => onTransformChange({ ...t, scale: t.scale * 1.15 })}
          >
            +
          </button>
          <button
            className="icon-btn"
            onClick={() =>
              onTransformChange({ ...t, scale: Math.max(0.3, t.scale / 1.15) })
            }
          >
            −
          </button>
          <button className="icon-btn" onClick={onRemove}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export default function Editor({ zineId, onBack }: Props) {
  const [zine, setZine] = useState<ZineRecord | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [flipMethod, setFlipMethod] = useState<FlipMethod>("long-edge");
  const [duplex, setDuplex] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    getZine(zineId).then((z) => z && setZine(z));
  }, [zineId]);

  const loadImageUrl = useCallback(
    async (imageId: string) => {
      if (imageUrls[imageId]) return;
      const blob = await getImage(imageId);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      setImageUrls((m) => ({ ...m, [imageId]: url }));
    },
    [imageUrls],
  );

  useEffect(() => {
    if (!zine) return;
    for (const p of zine.pages) {
      if (p.imageId) loadImageUrl(p.imageId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zine]);

  async function persist(next: ZineRecord) {
    setZine(next);
    next.updatedAt = Date.now();
    await saveZine(next);
  }

  async function handleFile(pageNumber: number, file: File) {
    if (!zine) return;
    const imageId = uuid();
    const normalized = await normalizeImageOrientation(file);
    await saveImage(imageId, normalized);
    const url = URL.createObjectURL(normalized);
    setImageUrls((m) => ({ ...m, [imageId]: url }));
    const nextPages = zine.pages.map((p) =>
      p.pageNumber === pageNumber ? { ...p, imageId } : p,
    );
    await persist({ ...zine, pages: nextPages });
  }

  function handleTransformChange(pageNumber: number, t: PageTransform) {
    if (!zine) return;
    const nextPages = zine.pages.map((p) =>
      p.pageNumber === pageNumber ? { ...p, transform: t } : p,
    );
    persist({ ...zine, pages: nextPages });
  }

  function handleRemove(pageNumber: number) {
    if (!zine) return;
    const nextPages = zine.pages.map((p) =>
      p.pageNumber === pageNumber ? { ...p, imageId: null } : p,
    );
    persist({ ...zine, pages: nextPages });
  }

  async function handleExport() {
    if (!zine) return;
    setExporting(true);
    try {
      if (duplex) {
        const plan = computeDuplexImposition(zine.pageCount, flipMethod);
        const result = await exportZineDuplexPdf(plan, zine.pages);
        downloadBlob(result.duplex, `${zine.title} - Duplex.pdf`);
      } else {
        const plan = computeImposition(zine.pageCount, flipMethod);
        const result = await exportZinePdfs(plan, zine.pages);
        downloadBlob(result.sideA, `${zine.title} - Side A.pdf`);
        downloadBlob(result.sideB, `${zine.title} - Side B.pdf`);
      }
    } finally {
      setExporting(false);
    }
  }

  if (!zine) return <div className="editor">Loading…</div>;

  const filledCount = zine.pages.filter((p) => p.imageId).length;

  // Group pages into spreads for display: cover alone, then facing pairs.
  const spreads: ZinePage[][] = [];
  spreads.push([zine.pages[0]]);
  for (let i = 1; i < zine.pages.length; i += 2) {
    spreads.push(zine.pages.slice(i, i + 2));
  }

  return (
    <div className="editor">
      <div className="editor-toolbar">
        <div className="left">
          <button className="back-link" onClick={onBack}>
            ← Back
          </button>
          <h1>{zine.title}</h1>
          <span className="zine-meta">
            {zine.format} · {zine.pageCount}pp · {filledCount}/{zine.pageCount} filled
          </span>
        </div>
      </div>

      <div className="spread-strip">
        {spreads.map((spread, i) => (
          <div className="spread" key={i}>
            {spread.map((page) => (
              <PageFrame
                key={page.pageNumber}
                page={page}
                isCover={page.pageNumber === 1}
                imageUrl={page.imageId ? imageUrls[page.imageId] ?? null : null}
                onFile={(f) => handleFile(page.pageNumber, f)}
                onTransformChange={(t) => handleTransformChange(page.pageNumber, t)}
                onRemove={() => handleRemove(page.pageNumber)}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="export-panel">
        <h3>Print & fold</h3>
        <p className="zine-meta">
          {duplex
            ? `${zine.pageCount / 4} A4 sheets, printed landscape, double-sided in a single pass.`
            : `${zine.pageCount / 4} A4 sheets, printed landscape, single-sided in two passes.`}
        </p>
        <label className="duplex-toggle">
          <input
            type="checkbox"
            checked={duplex}
            onChange={(e) => setDuplex(e.target.checked)}
          />{" "}
          My printer supports duplex (double-sided) printing
        </label>
        <div className="flip-toggle">
          <label>
            <input
              type="radio"
              checked={flipMethod === "long-edge"}
              onChange={() => setFlipMethod("long-edge")}
            />{" "}
            {duplex
              ? "Duplex setting: Flip on Long Edge (like a book)"
              : "Flip along long edge (like turning a book page)"}
          </label>
          <label>
            <input
              type="radio"
              checked={flipMethod === "short-edge"}
              onChange={() => setFlipMethod("short-edge")}
            />{" "}
            {duplex
              ? "Duplex setting: Flip on Short Edge (like a calendar)"
              : "Flip top-to-bottom (like a calendar)"}
          </label>
        </div>
        <ol>
          {(duplex
            ? computeDuplexImposition(zine.pageCount, flipMethod).instructions
            : computeImposition(zine.pageCount, flipMethod).instructions
          ).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
        <div className="export-actions">
          <button className="primary-btn" onClick={handleExport} disabled={exporting}>
            {exporting
              ? "Generating…"
              : duplex
                ? "Export Duplex PDF"
                : "Export Side A & Side B PDFs"}
          </button>
        </div>
      </div>
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
