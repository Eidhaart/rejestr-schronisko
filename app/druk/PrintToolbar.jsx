"use client";

import { useEffect, useState } from "react";

// toggles = [{ key: "foto", on: true, labelOn: "...", labelOff: "..." }]
// each one just flips a query param and reloads — servern bestämmer, not CSS,
// so hidden data is really not in the page (matters for RODO)
export default function PrintToolbar({ toggles = [] }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // nie drukujemy automatycznie, user decides when
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      setReady(true);
    };
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go);
    const fallback = setTimeout(go, 4000);
    return () => {
      window.removeEventListener("load", go);
      clearTimeout(fallback);
    };
  }, []);

  const flip = (key, value) => {
    const u = new URL(window.location.href);
    u.searchParams.set(key, value);
    window.location.href = u.toString();
  };

  return (
    <div className="no-print" style={bar}>
      <span style={{ fontSize: 13, color: "#57534e" }}>
        {ready ? "Dokument gotowy." : "Wczytywanie zdjęć…"}
      </span>

      {toggles.map((t) => (
        <div key={t.key} style={seg}>
          <button onClick={() => flip(t.key, "1")} style={t.on ? segOn : segOff}>{t.labelOn}</button>
          <button onClick={() => flip(t.key, "0")} style={!t.on ? segOn : segOff}>{t.labelOff}</button>
        </div>
      ))}

      <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
        <button onClick={() => window.print()} style={primary}>
          Drukuj / Zapisz PDF
        </button>
        <button onClick={() => window.close()} style={secondary}>
          Zamknij
        </button>
      </div>
    </div>
  );
}

const bar = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 14,
  padding: "10px 18px",
  borderBottom: "1px solid #e7e5e4",
  background: "#fafaf9",
  fontFamily: "system-ui, sans-serif",
  position: "sticky",
  top: 0,
  zIndex: 10,
};

const seg = {
  display: "flex",
  background: "#e7e5e4",
  borderRadius: 10,
  padding: 3,
  gap: 3,
};

const segBase = {
  border: "none",
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};

const segOn = { ...segBase, background: "#fff", color: "#0f766e", boxShadow: "0 1px 2px rgba(0,0,0,.12)" };
const segOff = { ...segBase, background: "transparent", color: "#57534e" };

const primary = {
  background: "#0d9488",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const secondary = {
  background: "#fff",
  color: "#44403c",
  border: "1px solid #d6d3d1",
  borderRadius: 10,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};
