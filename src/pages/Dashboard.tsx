import { useEffect, useState } from "react";
import type { ZineRecord } from "../types";
import { deleteZine, listZines } from "../lib/db";
import NewZineModal from "../components/NewZineModal";

interface Props {
  onOpenZine: (id: string) => void;
}

export default function Dashboard({ onOpenZine }: Props) {
  const [zines, setZines] = useState<ZineRecord[]>([]);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    listZines().then(setZines);
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Delete this zine? This can't be undone.")) return;
    await deleteZine(id);
    setZines((z) => z.filter((zine) => zine.id !== id));
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Zine Maker</h1>
        <p>Lay out A5 zines, print them on A4, fold and staple.</p>
      </div>

      <div className="zine-grid">
        <div className="zine-card">
          <button className="zine-cover" onClick={() => setShowModal(true)}>
            +
          </button>
          <div className="zine-title">New Zine</div>
        </div>

        {zines.map((zine) => (
          <div className="zine-card" key={zine.id}>
            <button
              className="zine-cover"
              onClick={() => onOpenZine(zine.id)}
            />
            <div className="zine-title">{zine.title}</div>
            <div className="zine-meta">
              {zine.format} · {zine.pageCount}pp ·{" "}
              {new Date(zine.createdAt).toLocaleDateString()}
            </div>
            <div className="zine-actions">
              <button className="pill danger" onClick={() => handleDelete(zine.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <NewZineModal
          onClose={() => setShowModal(false)}
          onCreated={(zine) => {
            setShowModal(false);
            setZines((z) => [zine, ...z]);
            onOpenZine(zine.id);
          }}
        />
      )}
    </div>
  );
}
