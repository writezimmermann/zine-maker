import { useState } from "react";
import { normalizePageCount } from "../lib/imposition";
import type { FinishedFormat, ZineRecord } from "../types";
import { DEFAULT_TRANSFORM } from "../types";
import uuid from "../lib/id";
import { saveZine } from "../lib/db";

const PAGE_COUNT_OPTIONS = [8, 12, 16, 20, 24, 32];

interface Props {
  onClose: () => void;
  onCreated: (zine: ZineRecord) => void;
}

type Step = "format" | "pageCount" | "name";

export default function NewZineModal({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>("format");
  const [format, setFormat] = useState<FinishedFormat>("A5");
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [title, setTitle] = useState("");

  const steps: Step[] = ["format", "pageCount", "name"];
  const stepIndex = steps.indexOf(step);

  function goBack() {
    if (stepIndex === 0) {
      onClose();
      return;
    }
    setStep(steps[stepIndex - 1]);
  }

  async function handleCreate() {
    const finalTitle = title.trim() || "Untitled Zine";
    const count = normalizePageCount(pageCount ?? 16);

    const zine: ZineRecord = {
      id: uuid(),
      title: finalTitle,
      format,
      pageCount: count,
      pages: Array.from({ length: count }, (_, i) => ({
        pageNumber: i + 1,
        imageId: null,
        transform: { ...DEFAULT_TRANSFORM },
      })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveZine(zine);
    onCreated(zine);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>New Zine</h2>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div className="modal-dots">
              {steps.map((s) => (
                <span
                  key={s}
                  className={"modal-dot" + (s === step ? " active" : "")}
                />
              ))}
            </div>
            <button className="modal-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </div>

        {step === "format" && (
          <>
            <div className="eyebrow modal-eyebrow">CHOOSE A FINISHED FORMAT</div>
            <div className="option-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <button
                className={"option-card" + (format === "A5" ? " selected" : "")}
                onClick={() => setFormat("A5")}
              >
                <div className="option-icon" style={{ width: 34, height: 48 }} />
                <div className="option-title">A5</div>
                <div className="option-desc">148×210mm
                  <br />
                  (print on A4, 2-up)
                </div>
              </button>
            </div>
            <button
              className="primary-btn"
              onClick={() => setStep("pageCount")}
            >
              Next
            </button>
          </>
        )}

        {step === "pageCount" && (
          <>
            <div className="eyebrow modal-eyebrow">PAGE COUNT</div>
            <div className="option-grid">
              {PAGE_COUNT_OPTIONS.map((count) => (
                <button
                  key={count}
                  className={
                    "option-card" + (pageCount === count ? " selected" : "")
                  }
                  onClick={() => setPageCount(count)}
                >
                  <div
                    className="option-icon"
                    style={{ width: 30 + count / 4, height: 44 }}
                  />
                  <div className="option-title">{count}</div>
                  <div className="option-desc">PAGES</div>
                </button>
              ))}
            </div>
            <button
              className="primary-btn"
              disabled={pageCount == null}
              onClick={() => setStep("name")}
            >
              Next
            </button>
          </>
        )}

        {step === "name" && (
          <>
            <div className="eyebrow modal-eyebrow">NAME YOUR ZINE</div>
            <input
              className="text-input"
              placeholder="Untitled Zine"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
            <div>
              <button className="primary-btn" onClick={handleCreate}>
                Create zine
              </button>
            </div>
          </>
        )}

        <div>
          <button className="back-link" onClick={goBack}>
            ← Back
          </button>
        </div>
      </div>
    </div>
  );
}
