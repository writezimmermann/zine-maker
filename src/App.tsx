import { useEffect, useState } from "react";
import Dashboard from "./pages/Dashboard";
import Editor from "./pages/Editor";

function getIdFromHash(): string | null {
  const hash = window.location.hash;
  const match = hash.match(/^#\/zine\/(.+)$/);
  return match ? match[1] : null;
}

function App() {
  const [zineId, setZineId] = useState<string | null>(getIdFromHash());

  useEffect(() => {
    const onHashChange = () => setZineId(getIdFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function openZine(id: string) {
    window.location.hash = `#/zine/${id}`;
    setZineId(id);
  }

  function goHome() {
    window.location.hash = "";
    setZineId(null);
  }

  if (zineId) {
    return <Editor zineId={zineId} onBack={goHome} />;
  }
  return <Dashboard onOpenZine={openZine} />;
}

export default App;
