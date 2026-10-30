"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  PawPrint, Plus, Search, LayoutGrid, Table2, Sun, Moon, LogOut, Settings, X,
  Upload, Trash2, Pencil, ImageOff, Calendar, Cpu, ClipboardList, ShieldCheck,
  Building2, Download, ShieldAlert, Check, Printer, Bell, Syringe, Stethoscope,
  Scale, Bug, Pill, Eye, EyeOff, HeartHandshake, Lock,
} from "lucide-react";
import {
  logout, createAnimal, updateAnimal, deleteAnimal, wipeAllAnimals, saveGminas,
  acknowledgeExport, saveEvent, saveEventBulk, deleteEvent, saveSettings,
} from "../app/actions";
import {
  STATUSES, SEX, EVENT_TYPES, PROFILAKTYKA, statusLabel, sexLabel, fmtDate,
  plLongDate, todayISO, eventsOf, dueInfo, dueText, weightHistory,
  collectReminders, defaultNext, animalTitle,
} from "../lib/care";

/* ----------------------------- constants ----------------------------- */

const STATUS_COLORS = {
  schronisko: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  adopcja:    "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  zwrocony:   "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  inny:       "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
};
const DUE_COLORS = {
  overdue: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900",
  soon:    "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900",
  ok:      "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
  none:    "bg-stone-50 text-stone-400 ring-stone-200 dark:bg-stone-800/50 dark:text-stone-500 dark:ring-stone-700",
};
const TYPE_ICONS = {
  zabieg: Stethoscope, wscieklizna: Syringe, zakazne: Syringe,
  pchly: Bug, pasozyty: Pill, waga: Scale,
};

const ALL = "__all__";
const NO_DATE = "__brak__";

/* ----------------------------- helpers ------------------------------- */

const cx = (...a) => a.filter(Boolean).join(" ");
// thumbs live under /thumbs/ in the same bucket; if one is missing the
// onError swaps to the full photo, so nothing ever shows broken
const thumbUrl = (url) =>
  url ? url.replace("/animal-photos/", "/animal-photos/thumbs/") : url;
const swapToFull = (e, full) => {
  if (!e.currentTarget.dataset.full && full) {
    e.currentTarget.dataset.full = "1";
    e.currentTarget.src = full;
  }
};
const uid = () =>
  crypto?.randomUUID?.() ||
  "id-" + Date.now() + "-" + Math.random().toString(36).slice(2);
const kg = (n) => (n === null || n === undefined ? "—" : `${String(n).replace(".", ",")} kg`);

function compressImage(file, maxDim = 1200, q = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = (height * maxDim) / width; width = maxDim; }
        else if (height > maxDim) { width = (width * maxDim) / height; height = maxDim; }
        const c = document.createElement("canvas");
        c.width = width; c.height = height;
        c.getContext("2d").drawImage(img, 0, 0, width, height);
        c.toBlob(
          (blob) => (blob ? resolve({ blob, url: URL.createObjectURL(blob) }) : reject(new Error("blob"))),
          "image/jpeg", q
        );
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const INPUT = "w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-500 transition placeholder-stone-400 dark:placeholder-stone-500";
// same as INPUT minus w-full — tailwind won't let w-auto win over it, wiem bo próbowałem
const INPUT_FREE = INPUT.replace("w-full ", "");
const CARD = "rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-sm dark:shadow-none";
const HOVER = "hover:border-stone-300 dark:hover:border-stone-700 hover:shadow-md dark:hover:shadow-none";
const PANEL = "rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900";
const SUBTLE_HOVER = "hover:bg-stone-100 dark:hover:bg-stone-800";
const BTN = cx("inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 dark:border-stone-800 px-3 py-2 text-sm font-medium transition", SUBTLE_HOVER);
const BTN_PRIMARY = "inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white px-3 py-2 text-sm font-medium transition";

/* ================================= App ================================ */

export default function AppShell({
  session, orgName, initialAnimals, gminas, canSeeAdopters, settings,
  exportPending = false, lastExportSentAt = null,
}) {
  const router = useRouter();
  const isAdmin = session.role === "admin";

  const [animals, setAnimals] = useState(initialAnimals);
  useEffect(() => { setAnimals(initialAnimals); }, [initialAnimals]);

  const [dark, setDark] = useState(false);
  const [view, setView] = useState("table");
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    try { const v = localStorage.getItem("view"); if (v) setView(v); } catch {}
  }, []);

  const [query, setQuery] = useState("");
  const [fGmina, setFGmina] = useState("");
  const [fStatus, setFStatus] = useState("schronisko");
  // dane adoptujących blurred on screen too — over-the-shoulder RODO
  const [showAdopters, setShowAdopters] = useState(false);

  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [eventDraft, setEventDraft] = useState(null);
  const [preview, setPreview] = useState(null);
  const [printMenu, setPrintMenu] = useState(false);

  // by id, not by object — after refresh() the card shows fresh data, nie stare
  const detail = detailId ? animals.find((a) => a.id === detailId) : null;

  const today = todayISO();
  const reminders = useMemo(() => collectReminders(animals, today), [animals, today]);
  const overdueCount = reminders.filter((r) => r.state === "overdue").length;

  /* ---- year tabs, like the sheet tabs in Excel ---- */
  const scoped = useMemo(
    () => (isAdmin && fGmina ? animals.filter((a) => a.gmina_id === fGmina) : animals),
    [animals, isAdmin, fGmina]
  );
  const years = useMemo(() => {
    const s = new Set();
    scoped.forEach((a) => { if (a.data_przyjecia) s.add(a.data_przyjecia.slice(0, 4)); });
    return [...s].sort((a, b) => b.localeCompare(a));
  }, [scoped]);
  const hasUndated = useMemo(() => scoped.some((a) => !a.data_przyjecia), [scoped]);

  const [year, setYear] = useState(ALL);
  useEffect(() => {
    if (year !== ALL && year !== NO_DATE && !years.includes(year)) setYear(ALL);
  }, [years, year]);

  const toggleTheme = () => {
    const el = document.documentElement;
    const next = !el.classList.contains("dark");
    el.classList.toggle("dark", next);
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch {}
    setDark(next);
  };
  const changeView = (v) => { setView(v); try { localStorage.setItem("view", v); } catch {} };
  const refresh = () => router.refresh();
  const doLogout = async () => { await logout(); refresh(); };

  /* ---- filtering: year, then status, gmina, search ---- */
  const visible = useMemo(() => {
    let list = scoped;
    if (year === NO_DATE) list = list.filter((a) => !a.data_przyjecia);
    else if (year !== ALL) list = list.filter((a) => a.data_przyjecia && a.data_przyjecia.startsWith(year));
    if (fStatus) list = list.filter((a) => a.status === fStatus);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((a) =>
        [a.opis, a.imie, a.chip, a.gmina_name, a.adoptujacy, ...(a.events || []).map((e) => e.opis)]
          .filter(Boolean).join(" ").toLowerCase().includes(q));
    }
    // oldest first, so "lp 1" is the first dog — like the paper book on the desk
    return [...list].sort((x, y) =>
      (x.data_przyjecia || "9999").localeCompare(y.data_przyjecia || "9999") ||
      String(x.created_at || "").localeCompare(String(y.created_at || ""))
    );
  }, [scoped, year, fStatus, query]);

  const statusCounts = useMemo(() => {
    const c = {};
    scoped.forEach((a) => { c[a.status] = (c[a.status] || 0) + 1; });
    return c;
  }, [scoped]);

  const printHref = (foto) => {
    const p = new URLSearchParams({ foto: String(foto), rodo: "0" });
    if (year !== ALL) p.set("rok", year === NO_DATE ? "brak" : year);
    if (fStatus) p.set("status", fStatus);
    if (isAdmin && fGmina) p.set("gmina", fGmina);
    return `/druk?${p}`;
  };

  const gminaLabel = isAdmin
    ? (fGmina ? gminas.find((g) => g.id === fGmina)?.name : null)
    : session.gminaName;

  const openEvent = (draft) => setEventDraft(draft);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-stone-900/80 backdrop-blur">
        <div className="mx-auto max-w-[1900px] px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="grid place-items-center h-9 w-9 rounded-xl bg-teal-600 text-white shrink-0">
              <PawPrint size={18} />
            </span>
            <div className="min-w-0">
              <h1 className="font-semibold leading-tight tracking-tight truncate">{orgName}</h1>
              <div className="text-xs flex items-center gap-1 truncate text-stone-500 dark:text-stone-400">
                {isAdmin
                  ? <><ShieldCheck size={12} /> Administrator</>
                  : <><Building2 size={12} /> Gmina {session.gminaName}</>}
              </div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={() => setModal("reminders")} aria-label="Przypomnienia"
              className={cx("relative h-9 rounded-xl px-2.5 inline-flex items-center gap-1.5 text-sm font-medium transition",
                reminders.length
                  ? overdueCount ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
                  : "text-stone-500 dark:text-stone-400",
                SUBTLE_HOVER)}>
              <Bell size={18} />
              {reminders.length > 0 && <span className="tabular-nums">{reminders.length}</span>}
            </button>
            <IconBtn onClick={toggleTheme} label="Motyw">{dark ? <Sun size={18} /> : <Moon size={18} />}</IconBtn>
            {isAdmin && <IconBtn onClick={() => setModal("settings")} label="Ustawienia" badge={exportPending}><Settings size={18} /></IconBtn>}
            <IconBtn onClick={doLogout} label="Wyloguj"><LogOut size={18} /></IconBtn>
          </div>
        </div>
      </header>

      {/* Reminder strip — only when something is actually due */}
      {reminders.length > 0 && (
        <div className="mx-auto max-w-[1900px] px-4 pt-4">
          <button onClick={() => setModal("reminders")}
            className={cx("w-full text-left rounded-2xl px-4 py-3 flex items-center gap-3 ring-1 transition",
              overdueCount ? DUE_COLORS.overdue : DUE_COLORS.soon)}>
            <Bell size={18} className="shrink-0" />
            <span className="text-sm">
              <strong>{overdueCount ? `${overdueCount} po terminie` : "Nic po terminie"}</strong>
              {reminders.length - overdueCount > 0 && <> · {reminders.length - overdueCount} wkrótce</>}
              <span className="hidden sm:inline"> — {summarizeReminders(reminders)}</span>
            </span>
            <span className="ml-auto text-sm font-medium shrink-0">Pokaż →</span>
          </button>
        </div>
      )}

      {/* Search + filters + view switch */}
      <div className="mx-auto max-w-[1900px] px-4 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500" />
            <input
              value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Szukaj: imię, chip, opis, zabieg…"
              className={cx(INPUT, "pl-10")}
            />
          </div>
          {isAdmin && (
            <select value={fGmina} onChange={(e) => setFGmina(e.target.value)}
              className={cx(INPUT_FREE, "w-auto appearance-none")}>
              <option value="">Wszystkie gminy</option>
              {gminas.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
          <div className="flex rounded-xl p-1 bg-stone-200 dark:bg-stone-800 shrink-0 overflow-x-auto">
            {[["schronisko", "W schronisku"], ["adopcja", "Adoptowane"], ["", "Wszystkie"]].map(([id, label]) => (
              <button key={id || "all"} onClick={() => setFStatus(id)}
                className={cx("px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition",
                  fStatus === id ? "bg-white dark:bg-stone-700 shadow-sm" : "text-stone-500 dark:text-stone-400")}>
                {label}
                <span className="ml-1.5 text-xs tabular-nums opacity-60">
                  {id ? statusCounts[id] || 0 : scoped.length}
                </span>
              </button>
            ))}
          </div>
          <div className="relative shrink-0">
            <button onClick={() => setPrintMenu((v) => !v)}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-300 dark:border-stone-700 px-3 py-2.5 text-sm font-medium transition hover:bg-stone-100 dark:hover:bg-stone-800"
              title="Wersja do druku / PDF">
              <Printer size={17} /> <span className="hidden sm:inline">Drukuj</span>
            </button>
            {printMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setPrintMenu(false)} />
                <div className="absolute right-0 mt-2 z-50 w-64 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-lg overflow-hidden">
                  <a href={printHref(1)} target="_blank" rel="noopener noreferrer"
                    onClick={() => setPrintMenu(false)}
                    className="block px-4 py-3 text-sm hover:bg-stone-100 dark:hover:bg-stone-800 transition">
                    Drukuj <strong>ze zdjęciami</strong>
                    <span className="block text-xs text-stone-500 dark:text-stone-400">A4 poziomo, to co widać na liście</span>
                  </a>
                  <a href={printHref(0)} target="_blank" rel="noopener noreferrer"
                    onClick={() => setPrintMenu(false)}
                    className="block px-4 py-3 text-sm border-t border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 transition">
                    Drukuj <strong>bez zdjęć</strong>
                    <span className="block text-xs text-stone-500 dark:text-stone-400">A4 poziomo, oszczędza tusz</span>
                  </a>
                  <div className="px-4 py-2.5 text-xs border-t border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
                    <Lock size={12} /> Dane adoptujących domyślnie ukryte (RODO)
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="flex rounded-xl p-1 bg-stone-200 dark:bg-stone-800 shrink-0">
            <button onClick={() => changeView("table")} aria-label="Tabela"
              className={cx("p-2 rounded-lg transition", view === "table" ? "bg-white dark:bg-stone-700 shadow-sm" : "text-stone-500 dark:text-stone-400")}><Table2 size={18} /></button>
            <button onClick={() => changeView("grid")} aria-label="Kafelki"
              className={cx("p-2 rounded-lg transition", view === "grid" ? "bg-white dark:bg-stone-700 shadow-sm" : "text-stone-500 dark:text-stone-400")}><LayoutGrid size={18} /></button>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-[1900px] px-4 pt-4 pb-28">
        {visible.length === 0 ? (
          <Empty isAdmin={isAdmin} onAdd={() => { setEditing(null); setModal("add"); }} />
        ) : view === "table" ? (
          <SheetTable rows={visible} year={year} gminaLabel={gminaLabel} today={today}
            showGmina={isAdmin && !fGmina}
            canSeeAdopters={canSeeAdopters} showAdopters={showAdopters}
            onToggleAdopters={() => setShowAdopters((v) => !v)}
            onRow={(a) => setDetailId(a.id)} onImage={(src) => setPreview(src)} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
            {visible.map((a) => <GridCard key={a.id} a={a} today={today} onClick={() => setDetailId(a.id)} showGmina={isAdmin} />)}
          </div>
        )}
      </main>

      {/* Year tabs along the bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-stone-200 dark:border-stone-800 bg-white/95 dark:bg-stone-900/95 backdrop-blur">
        <div className="mx-auto max-w-[1900px] px-3 py-2 flex items-center gap-2">
          <div className="flex items-center gap-2 overflow-x-auto">
            <YearTab active={year === ALL} onClick={() => setYear(ALL)}>Wszystkie lata</YearTab>
            {years.map((y) => <YearTab key={y} active={year === y} onClick={() => setYear(y)}>{y}</YearTab>)}
            {hasUndated && <YearTab active={year === NO_DATE} onClick={() => setYear(NO_DATE)}>Bez daty</YearTab>}
          </div>
          {isAdmin && (
            <button onClick={() => { setEditing(null); setModal("add"); }} aria-label="Dodaj zwierzę"
              className="ml-auto shrink-0 h-11 w-11 rounded-full bg-teal-600 hover:bg-teal-700 text-white grid place-items-center shadow-lg shadow-teal-600/30 transition active:scale-95">
              <Plus size={24} />
            </button>
          )}
        </div>
      </div>

      {detail && (
        <Detail a={detail} isAdmin={isAdmin} today={today} canSeeAdopters={canSeeAdopters}
          onClose={() => setDetailId(null)}
          onImage={(src) => setPreview(src)}
          onAddEvent={(typ) => openEvent({ animal_id: detail.id, typ })}
          onEditEvent={(e) => openEvent(e)}
          onEdit={() => { setEditing(detail); setDetailId(null); setModal("edit"); }}
          onDelete={async () => {
            if (!confirm("Usunąć to zwierzę razem z całą historią leczenia? Tej operacji nie można cofnąć.")) return;
            await deleteAnimal(detail.id); setDetailId(null); refresh();
          }} />
      )}

      {eventDraft && (
        <EventForm draft={eventDraft} animal={animals.find((a) => a.id === eventDraft.animal_id)}
          onCancel={() => setEventDraft(null)}
          onSaved={() => { setEventDraft(null); refresh(); }} />
      )}

      {preview && <Lightbox src={preview} onClose={() => setPreview(null)} />}

      {(modal === "add" || modal === "edit") && (
        <EntryForm gminas={gminas} initial={editing}
          onCancel={() => { setModal(null); setEditing(null); }}
          onSaved={(id) => {
            setModal(null); setEditing(null); refresh();
            if (id) setDetailId(id); // straight into the new dog's card, to add vaccines etc.
          }} />
      )}

      {modal === "reminders" && (
        <RemindersPanel animals={scoped} today={today} isAdmin={isAdmin}
          onOpen={(id) => { setModal(null); setDetailId(id); }}
          onClose={() => setModal(null)}
          onSaved={() => refresh()} />
      )}

      {modal === "settings" && (
        <SettingsPanel gminas={gminas} settings={settings}
          exportPending={exportPending}
          lastExportSentAt={lastExportSentAt}
          selectedGmina={fGmina}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); refresh(); }}
          onAcknowledged={() => { setModal(null); refresh(); }}
          onWipe={async () => {
            if (!confirm("Usunąć WSZYSTKIE zwierzęta i całą historię leczenia? Nie można tego cofnąć.")) return;
            await wipeAllAnimals(); setModal(null); refresh();
          }} />
      )}
    </div>
  );
}

function summarizeReminders(list) {
  const by = {};
  list.forEach((r) => { by[r.typ] = (by[r.typ] || 0) + 1; });
  return PROFILAKTYKA.filter((t) => by[t]).map((t) => `${EVENT_TYPES[t].short}: ${by[t]}`).join(", ");
}

function YearTab({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={cx("shrink-0 rounded-full px-5 py-2 text-sm font-semibold whitespace-nowrap transition",
        active ? "bg-teal-600 text-white" : cx("text-stone-600 dark:text-stone-300", SUBTLE_HOVER))}>
      {children}
    </button>
  );
}

/* ========================= the spreadsheet view ======================== */

function Lightbox({ src, onClose }) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-4" onClick={onClose}>
      <img src={src} alt="" onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] max-w-[92vw] object-contain rounded-lg shadow-2xl" />
      <button onClick={onClose} aria-label="Zamknij"
        className="absolute top-4 right-4 h-10 w-10 grid place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 transition">
        <X size={20} />
      </button>
    </div>
  );
}

const TH = "border border-stone-300 dark:border-stone-600 bg-[#cfe3d4] dark:bg-teal-950 px-2.5 py-2.5 text-xs font-semibold text-center align-middle text-stone-800 dark:text-teal-100";
const TD = "border border-stone-300 dark:border-stone-700 px-2.5 py-2 text-sm align-middle";

function SheetTable({ rows, year, gminaLabel, today, showGmina, canSeeAdopters, showAdopters, onToggleAdopters, onRow, onImage }) {
  const title =
    "Zwierzęta w ewidencji – " +
    (gminaLabel ? `gmina ${gminaLabel}` : "wszystkie gminy") +
    (year !== ALL && year !== NO_DATE ? `, przyjęte w ${year} r.` : "");
  const cols = 16 + (showGmina ? 1 : 0) + (canSeeAdopters ? 1 : 0);

  return (
    <div className="overflow-auto rounded-xl border border-stone-300 dark:border-stone-700 max-h-[calc(100vh-260px)]">
      <table className="w-full min-w-[1500px] border-collapse bg-white dark:bg-stone-900">
        <thead className="sticky top-0 z-10">
          <tr>
            <th colSpan={cols}
              className="border border-stone-300 dark:border-stone-600 bg-[#cfe3d4] dark:bg-teal-950 px-3 py-2.5 text-base font-semibold text-stone-800 dark:text-teal-100">
              {title}
            </th>
          </tr>
          <tr>
            <th className={cx(TH, "w-10")}>lp</th>
            <th className={cx(TH, "w-24")}>data przyjęcia</th>
            {showGmina && <th className={cx(TH, "w-24")}>gmina</th>}
            <th className={cx(TH, "w-36")}>mikrochip</th>
            <th className={cx(TH, "min-w-[200px]")}>opis</th>
            <th className={cx(TH, "w-24")}>imię</th>
            <th className={cx(TH, "w-20")}>płeć</th>
            <th className={cx(TH, "w-56")}>zabiegi weterynaryjne</th>
            <th className={cx(TH, "w-32")}>szczep. wścieklizna</th>
            <th className={cx(TH, "w-32")}>szczep. choroby zakaźne</th>
            <th className={cx(TH, "w-28")}>waga</th>
            <th className={cx(TH, "w-32")}>pchły i kleszcze</th>
            <th className={cx(TH, "w-32")}>pasożyty wewn.</th>
            <th className={cx(TH, "w-28")}>status</th>
            <th className={cx(TH, "w-24")}>data adopcji</th>
            {canSeeAdopters && (
              <th className={cx(TH, "w-56")}>
                <button onClick={onToggleAdopters} className="inline-flex items-center gap-1.5 hover:underline"
                  title={showAdopters ? "Ukryj dane osobowe" : "Pokaż dane osobowe"}>
                  dane adoptującego {showAdopters ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </th>
            )}
            <th className={cx(TH, "w-40")}>zdjęcie</th>
            <th className={cx(TH, "w-48")}>notatka</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a, i) => {
            const zabiegi = eventsOf(a.events, "zabieg");
            const weights = weightHistory(a.events);
            const w = weights[weights.length - 1];
            const prev = weights[weights.length - 2];
            return (
              <tr key={a.id} onClick={() => onRow(a)}
                className="cursor-pointer even:bg-stone-50 dark:even:bg-stone-800/40 hover:bg-teal-50 dark:hover:bg-stone-800 transition">
                <td className={cx(TD, "text-center text-stone-500 dark:text-stone-400")}>{i + 1}</td>
                <td className={cx(TD, "text-center whitespace-nowrap")}>{fmtDate(a.data_przyjecia)}</td>
                {showGmina && <td className={cx(TD, "text-center")}>{a.gmina_name || ""}</td>}
                <td className={cx(TD, "text-center font-mono text-xs whitespace-nowrap")}>{a.chip || "—"}</td>
                <td className={cx(TD)}>{a.opis || ""}</td>
                <td className={cx(TD, "text-center font-medium")}>{a.imie || "—"}</td>
                <td className={cx(TD, "text-center")}>{sexLabel(a.plec)}</td>
                <td className={cx(TD, "text-xs align-top")}>
                  {zabiegi.length === 0
                    ? <span className="text-stone-300 dark:text-stone-600">—</span>
                    : (
                      <ul className="space-y-0.5">
                        {zabiegi.slice(0, 3).map((z) => (
                          <li key={z.id}><span className="tabular-nums text-stone-500 dark:text-stone-400">{fmtDate(z.data)}</span> {z.opis}</li>
                        ))}
                        {zabiegi.length > 3 && <li className="text-stone-400">+ {zabiegi.length - 3} wcześniej</li>}
                      </ul>
                    )}
                </td>
                {["wscieklizna", "zakazne"].map((t) => (
                  <td key={t} className={cx(TD, "text-center")}><DueCell info={dueInfo(a.events, t, today)} adopted={a.status !== "schronisko"} /></td>
                ))}
                <td className={cx(TD, "text-center whitespace-nowrap")}>
                  {w ? (
                    <div>
                      <div className="font-medium tabular-nums">
                        {kg(w.waga)}
                        {prev && <Delta now={w.waga} before={prev.waga} />}
                      </div>
                      <div className="text-[11px] text-stone-400">{fmtDate(w.data)} · {weights.length} pom.</div>
                    </div>
                  ) : <span className="text-stone-300 dark:text-stone-600">—</span>}
                </td>
                {["pchly", "pasozyty"].map((t) => (
                  <td key={t} className={cx(TD, "text-center")}><DueCell info={dueInfo(a.events, t, today)} adopted={a.status !== "schronisko"} /></td>
                ))}
                <td className={cx(TD, "text-center whitespace-nowrap")}><StatusPill id={a.status} /></td>
                <td className={cx(TD, "text-center whitespace-nowrap")}>{a.status === "adopcja" ? fmtDate(a.data_adopcji) : ""}</td>
                {canSeeAdopters && (
                  <td className={cx(TD, "text-xs whitespace-pre-wrap break-words")}>
                    {a.adoptujacy
                      ? <span className={cx("transition", !showAdopters && "blur-sm select-none")}>{a.adoptujacy}</span>
                      : <span className="text-stone-300 dark:text-stone-600">—</span>}
                  </td>
                )}
                <td className={cx(TD, "text-center p-1")}>
                  {a.zdjecie
                    ? <img src={thumbUrl(a.zdjecie)} alt="" loading="lazy" decoding="async"
                        onError={(e) => swapToFull(e, a.zdjecie)}
                        onClick={(e) => { e.stopPropagation(); onImage(a.zdjecie); }}
                        className="h-24 w-36 object-contain mx-auto rounded bg-stone-50 dark:bg-stone-800 cursor-zoom-in" />
                    : <span className="text-stone-300 dark:text-stone-600">—</span>}
                </td>
                <td className={cx(TD, "text-left align-top whitespace-pre-wrap break-words text-xs")}>
                  {a.notatka || <span className="text-stone-300 dark:text-stone-600">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ostatnia dawka + valid until. Colour = how loud it should be.
function DueCell({ info, adopted }) {
  if (info.state === "none") return <span className="text-xs text-stone-300 dark:text-stone-600">brak</span>;
  // adopted: the dates are just history now, no alarms
  const tone = adopted ? "none" : info.state;
  return (
    <div className={cx("inline-block rounded-lg px-2 py-1 ring-1 text-xs leading-tight", DUE_COLORS[tone], adopted && "!text-stone-500")}>
      <div className="font-medium tabular-nums">{fmtDate(info.last.data)}</div>
      {info.due && <div className="tabular-nums opacity-80">do {fmtDate(info.due)}</div>}
      {!adopted && info.state !== "ok" && <div className="font-semibold">{dueText(info)}</div>}
    </div>
  );
}

function Delta({ now, before }) {
  const d = Math.round((now - before) * 10) / 10;
  if (!d) return null;
  return (
    <span className={cx("ml-1 text-[11px]", d > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>
      {d > 0 ? "▲" : "▼"}{String(Math.abs(d)).replace(".", ",")}
    </span>
  );
}

/* ============================ presentational ========================== */

function IconBtn({ onClick, label, children, badge }) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
      className={cx("relative h-9 w-9 grid place-items-center rounded-xl transition text-stone-500 dark:text-stone-400", SUBTLE_HOVER)}>
      {children}
      {badge && (
        <span className="absolute top-1 left-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-stone-900" />
      )}
    </button>
  );
}

function StatusPill({ id, size = "sm" }) {
  return (
    <span className={cx("inline-flex items-center rounded-full font-medium",
      size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm", STATUS_COLORS[id] || STATUS_COLORS.inny)}>
      {statusLabel(id)}
    </span>
  );
}

function Photo({ src, className, iconSize = 28 }) {
  if (src) return <img src={thumbUrl(src)} alt="" loading="lazy" decoding="async"
    onError={(e) => swapToFull(e, src)} className={cx("object-cover", className)} />;
  return (
    <div className={cx("grid place-items-center bg-stone-100 dark:bg-stone-800 text-stone-300 dark:text-stone-600", className)}>
      <ImageOff size={iconSize} />
    </div>
  );
}

function GridCard({ a, today, onClick, showGmina }) {
  const due = a.status === "schronisko"
    ? PROFILAKTYKA.map((t) => ({ t, ...dueInfo(a.events, t, today) })).filter((x) => x.state === "overdue" || x.state === "soon")
    : [];
  const w = weightHistory(a.events).pop();
  return (
    <button onClick={onClick} className={cx("group text-left overflow-hidden transition", CARD, HOVER)}>
      <div className="relative">
        <Photo src={a.zdjecie} className="h-44 w-full" />
        <div className="absolute top-2 left-2"><StatusPill id={a.status} /></div>
      </div>
      <div className="p-3.5">
        <div className="flex items-baseline gap-2">
          <p className="font-semibold leading-snug truncate">{a.imie || "Bez imienia"}</p>
          <span className="text-xs text-stone-400">{sexLabel(a.plec)}{w ? ` · ${kg(w.waga)}` : ""}</span>
        </div>
        <p className="text-sm leading-snug line-clamp-2 text-stone-600 dark:text-stone-300">{a.opis}</p>
        <div className="mt-2 space-y-1 text-xs text-stone-500 dark:text-stone-400">
          <div className="flex items-center gap-1.5"><Calendar size={12} className="text-stone-400 dark:text-stone-500" /> przyjęty {fmtDate(a.data_przyjecia)}</div>
          {a.chip && <div className="flex items-center gap-1.5"><Cpu size={12} className="text-stone-400 dark:text-stone-500" /> <span className="font-mono truncate">{a.chip}</span></div>}
          {showGmina && <div className="flex items-center gap-1.5"><Building2 size={12} className="text-stone-400 dark:text-stone-500" /> {a.gmina_name}</div>}
        </div>
        {due.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {due.map((d) => (
              <span key={d.t} className={cx("rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1", DUE_COLORS[d.state])}>
                {EVENT_TYPES[d.t].short}: {dueText(d)}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

function Empty({ isAdmin, onAdd }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 p-10 text-center">
      <span className="mx-auto grid place-items-center h-12 w-12 rounded-2xl mb-3 bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
        <ClipboardList size={22} />
      </span>
      <p className="font-medium">Brak wpisów</p>
      <p className="text-sm mt-1 text-stone-500 dark:text-stone-400">
        {isAdmin ? "Nic nie pasuje do filtrów. Zmień filtr albo dodaj zwierzę." : "Nic nie pasuje do wybranych filtrów."}
      </p>
      {isAdmin && (
        <button onClick={onAdd} className={cx(BTN_PRIMARY, "mt-4 px-4 py-2.5")}>
          <Plus size={16} /> Dodaj zwierzę
        </button>
      )}
    </div>
  );
}

function Overlay({ onClose, children, z = "z-40" }) {
  return (
    <div className={cx("fixed inset-0 grid place-items-end sm:place-items-center p-0 sm:p-4 bg-stone-900/40 dark:bg-black/70", z)}
      onClick={onClose}>
      <div className="w-full sm:w-auto flex justify-center" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function ModalHead({ title, icon, onClose }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 dark:border-stone-800">
      <h2 className="font-semibold flex items-center gap-2">{icon}{title}</h2>
      <button onClick={onClose} className={cx("p-1.5 rounded-lg transition", SUBTLE_HOVER)}><X size={18} /></button>
    </div>
  );
}

function Info({ icon, label, value, mono }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 shrink-0 text-stone-400 dark:text-stone-500">{icon}</span>
      <div className="min-w-0">
        <div className="text-xs text-stone-400 dark:text-stone-500">{label}</div>
        <div className={cx("text-sm break-words", mono && "font-mono")}>{value || "—"}</div>
      </div>
    </div>
  );
}

function SectionHead({ icon, title, extra, onAdd }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-teal-600 dark:text-teal-400">{icon}</span>
      <h3 className="text-sm font-semibold">{title}</h3>
      {extra}
      {onAdd && (
        <button onClick={onAdd} className="ml-auto text-xs font-medium text-teal-600 dark:text-teal-400 inline-flex items-center gap-1 hover:underline">
          <Plus size={13} /> Dodaj
        </button>
      )}
    </div>
  );
}

/* ============================== detail ================================= */

function Detail({ a, isAdmin, today, canSeeAdopters, onClose, onImage, onAddEvent, onEditEvent, onEdit, onDelete }) {
  const [adopterOpen, setAdopterOpen] = useState(false);
  const zabiegi = eventsOf(a.events, "zabieg");
  const weights = weightHistory(a.events);
  const inShelter = a.status === "schronisko";
  const edit = isAdmin ? onEditEvent : null;

  return (
    <Overlay onClose={onClose}>
      <div className={cx("w-full max-w-3xl overflow-hidden max-h-[94vh] flex flex-col", PANEL)}>
        <div className="relative shrink-0">
          {a.zdjecie
            ? <img src={a.zdjecie} alt="" onClick={() => onImage(a.zdjecie)} className="h-56 w-full object-cover cursor-zoom-in" />
            : <Photo src={null} className="h-32 w-full" iconSize={32} />}
          <button onClick={onClose} className="absolute top-3 right-3 h-9 w-9 grid place-items-center rounded-full bg-black/40 text-white hover:bg-black/60 transition"><X size={18} /></button>
          <div className="absolute bottom-3 left-3"><StatusPill id={a.status} size="md" /></div>
        </div>

        <div className="p-5 overflow-y-auto space-y-6">
          <div>
            <h2 className="text-xl font-semibold leading-snug">
              {a.imie || "Bez imienia"}
              <span className="ml-2 text-sm font-normal text-stone-400">{sexLabel(a.plec)}</span>
            </h2>
            <p className="text-sm mt-0.5 text-stone-600 dark:text-stone-300">{a.opis}</p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Info icon={<Calendar size={15} />} label="Data przyjęcia" value={fmtDate(a.data_przyjecia)} />
              <Info icon={<Building2 size={15} />} label="Gmina" value={a.gmina_name} />
              <Info icon={<Cpu size={15} />} label="Mikrochip" value={a.chip} mono />
              <Info icon={<Scale size={15} />} label="Aktualna waga"
                value={weights.length ? `${kg(weights[weights.length - 1].waga)} (${fmtDate(weights[weights.length - 1].data)})` : null} />
            </div>
          </div>

          {a.status === "adopcja" && (
            <div className="rounded-xl border border-teal-200 dark:border-teal-900/60 bg-teal-50/60 dark:bg-teal-950/30 p-4">
              <div className="flex items-center gap-2">
                <HeartHandshake size={16} className="text-teal-600 dark:text-teal-400" />
                <span className="text-sm font-semibold">Adopcja {fmtDate(a.data_adopcji)}</span>
                {canSeeAdopters && a.adoptujacy && (
                  <button onClick={() => setAdopterOpen((v) => !v)} className="ml-auto text-xs font-medium text-teal-700 dark:text-teal-300 inline-flex items-center gap-1">
                    {adopterOpen ? <><EyeOff size={13} /> Ukryj</> : <><Eye size={13} /> Pokaż dane</>}
                  </button>
                )}
              </div>
              {canSeeAdopters ? (
                a.adoptujacy ? (
                  <p className={cx("mt-2 text-sm whitespace-pre-wrap transition", !adopterOpen && "blur-sm select-none")}>{a.adoptujacy}</p>
                ) : <p className="mt-2 text-xs text-stone-500">Nie wpisano danych osoby adoptującej.</p>
              ) : (
                <p className="mt-2 text-xs text-stone-500 dark:text-stone-400 flex items-center gap-1.5"><Lock size={12} /> Dane osoby adoptującej nie są udostępniane (RODO).</p>
              )}
            </div>
          )}

          {a.notatka && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-3">
              <div className="mb-1 flex items-center gap-2">
                <ClipboardList size={14} className="text-amber-600 dark:text-amber-400" />
                <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  Notatka{isAdmin && (a.notatka_publiczna ? " — widoczna dla gminy" : " — tylko administrator")}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-stone-700 dark:text-stone-200">{a.notatka}</p>
            </div>
          )}

          {/* --- zabiegi --- */}
          <section>
            <SectionHead icon={<Stethoscope size={16} />} title="Zabiegi weterynaryjne"
              extra={<span className="text-xs text-stone-400">{zabiegi.length || ""}</span>}
              onAdd={isAdmin ? () => onAddEvent("zabieg") : null} />
            <EventList events={zabiegi} onEdit={edit} showWeight empty="Brak zabiegów." />
          </section>

          {/* --- profilaktyka --- */}
          <section>
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-3">Profilaktyka</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PROFILAKTYKA.map((t) => {
                const info = dueInfo(a.events, t, today);
                const Icon = TYPE_ICONS[t];
                return (
                  <div key={t} className="rounded-xl border border-stone-200 dark:border-stone-800 p-3">
                    <SectionHead icon={<Icon size={15} />} title={EVENT_TYPES[t].label}
                      onAdd={isAdmin ? () => onAddEvent(t) : null} />
                    {info.state !== "none" && (
                      <div className={cx("mb-2 rounded-lg px-2.5 py-1.5 ring-1 text-xs flex items-center gap-2",
                        DUE_COLORS[inShelter ? info.state : "none"])}>
                        <span>Następne: <strong className="tabular-nums">{fmtDate(info.due)}</strong></span>
                        {inShelter && <span className="ml-auto font-semibold">{dueText(info)}</span>}
                      </div>
                    )}
                    <p className="text-[11px] text-stone-400 mb-1.5">powtarzać {repeatText(EVENT_TYPES[t].months)}</p>
                    <EventList events={eventsOf(a.events, t)} onEdit={edit} compact empty="Jeszcze nie podano." />
                  </div>
                );
              })}
            </div>
          </section>

          {/* --- waga --- */}
          <section>
            <SectionHead icon={<Scale size={16} />} title="Waga – historia"
              onAdd={isAdmin ? () => onAddEvent("waga") : null} />
            {weights.length === 0 ? (
              <p className="text-sm text-stone-400">Brak pomiarów. Wagę można wpisać przy każdym zabiegu.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_250px] gap-3 items-start">
                <WeightChart points={weights} />
                <table className="w-full text-sm">
                  <tbody>
                    {[...weights].reverse().map((w, i, arr) => (
                      <tr key={w.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                        <td className="py-1 tabular-nums text-stone-500">{fmtDate(w.data)}</td>
                        <td className="py-1 text-right tabular-nums font-medium whitespace-nowrap">
                          {kg(w.waga)}{arr[i + 1] && <Delta now={w.waga} before={arr[i + 1].waga} />}
                        </td>
                        <td className="py-1 pl-2 text-[11px] text-stone-400">{EVENT_TYPES[w.typ]?.short}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="space-y-2 pt-2">
            <a href={`/druk/wpis?id=${a.id}`} target="_blank" rel="noopener"
              className={cx(BTN, "w-full py-2.5")}>
              <Printer size={15} /> Karta zwierzęcia – drukuj / PDF
            </a>
            {isAdmin && (
              <div className="flex gap-2">
                <button onClick={onEdit} className={cx(BTN, "flex-1 py-2.5")}>
                  <Pencil size={15} /> Edytuj dane
                </button>
                <button onClick={onDelete} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-500/10 text-red-500 px-4 py-2.5 text-sm font-medium hover:bg-red-500/20 transition">
                  <Trash2 size={15} /> Usuń
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Overlay>
  );
}

const repeatText = (m) => (m === 1 ? "co miesiąc" : m === 12 ? "raz w roku" : `co ${m} mies.`);

function EventList({ events, onEdit, showWeight, compact, empty }) {
  if (!events.length) return <p className="text-sm text-stone-400">{empty}</p>;
  return (
    <ul className={cx("divide-y divide-stone-100 dark:divide-stone-800", compact ? "text-xs" : "text-sm")}>
      {events.map((e) => (
        <li key={e.id}
          onClick={onEdit ? () => onEdit(e) : undefined}
          className={cx("flex items-baseline gap-2 py-1.5", onEdit && "cursor-pointer hover:text-teal-700 dark:hover:text-teal-300")}>
          <span className="tabular-nums text-stone-500 dark:text-stone-400 shrink-0">{fmtDate(e.data)}</span>
          <span className="min-w-0 flex-1 break-words">{e.opis || <span className="text-stone-400">—</span>}</span>
          {showWeight && e.waga != null && <span className="tabular-nums text-stone-500 shrink-0">{kg(e.waga)}</span>}
          {onEdit && <Pencil size={11} className="text-stone-300 dark:text-stone-600 shrink-0" />}
        </li>
      ))}
    </ul>
  );
}

// Tiny hand-rolled SVG chart. A chart lib for one line would weigh more
// than the rest of the app. Lite linjer, lite matte, klart.
function WeightChart({ points }) {
  if (points.length < 2) {
    return (
      <div className="h-36 rounded-xl bg-stone-50 dark:bg-stone-800/50 grid place-items-center text-xs text-stone-400">
        Wykres pojawi się po drugim pomiarze
      </div>
    );
  }
  const W = 320, H = 140, P = { l: 34, r: 10, t: 12, b: 22 };
  const vals = points.map((p) => p.waga);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max - min < 1) { min -= 0.5; max += 0.5; }
  const pad = (max - min) * 0.15;
  min = Math.max(0, min - pad); max += pad;
  // x po prawdziwej dacie — three quiet months should look like three quiet months
  const t = (d) => new Date(d + "T00:00:00Z").getTime();
  const t0 = t(points[0].data), t1 = t(points[points.length - 1].data);
  // all on one day (admission + first vet visit) -> just space them evenly
  const byIndex = t1 === t0;
  const xi = (i) => P.l + (i / (points.length - 1)) * (W - P.l - P.r);
  const xs = points.map((p, i) => (byIndex ? xi(i) : P.l + ((t(p.data) - t0) / (t1 - t0)) * (W - P.l - P.r)));
  const y = (v) => P.t + (1 - (v - min) / (max - min)) * (H - P.t - P.b);
  const line = points.map((p, i) => `${xs[i].toFixed(1)},${y(p.waga).toFixed(1)}`).join(" ");
  const ticks = [min, (min + max) / 2, max];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-xl bg-stone-50 dark:bg-stone-800/50 text-teal-600 dark:text-teal-400">
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} className="stroke-stone-200 dark:stroke-stone-700" strokeDasharray="3 3" />
          <text x={P.l - 5} y={y(v) + 3} textAnchor="end" className="fill-stone-400" fontSize="9">{v.toFixed(1).replace(".", ",")}</text>
        </g>
      ))}
      <text x={P.l} y={H - 6} className="fill-stone-400" fontSize="9">{fmtDate(points[0].data)}</text>
      <text x={W - P.r} y={H - 6} textAnchor="end" className="fill-stone-400" fontSize="9">{fmtDate(points[points.length - 1].data)}</text>
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={p.id} cx={xs[i]} cy={y(p.waga)} r="3" fill="currentColor">
          <title>{fmtDate(p.data)}: {kg(p.waga)}</title>
        </circle>
      ))}
    </svg>
  );
}

/* ============================ forms =================================== */

function FieldLabel({ children }) {
  return <span className="text-xs font-medium text-stone-500 dark:text-stone-400">{children}</span>;
}
function Field({ label, required, hint, children }) {
  return (
    <div>
      <div className="mb-1.5"><FieldLabel>{label}{required && <span className="text-red-500"> *</span>}</FieldLabel></div>
      {children}
      {hint && <p className="mt-1 text-[11px] text-stone-400">{hint}</p>}
    </div>
  );
}

function EventForm({ draft, animal, onCancel, onSaved }) {
  const isEdit = !!draft.id;
  const [f, setF] = useState(() => ({
    typ: draft.typ || "zabieg",
    data: draft.data || todayISO(),
    opis: draft.opis || "",
    waga: draft.waga != null ? String(draft.waga).replace(".", ",") : "",
    nastepny: draft.nastepny || defaultNext(draft.typ || "zabieg", draft.data || todayISO()) || "",
  }));
  // ktoś wpisał własną datę? then hands off
  const [nextTouched, setNextTouched] = useState(isEdit && !!draft.nastepny);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const meta = EVENT_TYPES[f.typ];

  const set = (k, v) => {
    setErr("");
    setF((p) => {
      const n = { ...p, [k]: v };
      if ((k === "data" || k === "typ") && !nextTouched) n.nastepny = defaultNext(n.typ, n.data) || "";
      return n;
    });
  };

  const submit = async () => {
    setBusy(true);
    const res = await saveEvent(JSON.stringify({
      id: draft.id, animal_id: draft.animal_id, ...f,
    }));
    if (res?.error) { setErr(res.error); setBusy(false); return; }
    onSaved();
  };

  const remove = async () => {
    if (!confirm("Usunąć ten wpis z historii?")) return;
    setBusy(true);
    const res = await deleteEvent(draft.id);
    if (res?.error) { setErr(res.error); setBusy(false); return; }
    onSaved();
  };

  const opisLabel = f.typ === "zabieg" ? "Jaki zabieg" : f.typ === "waga" ? "Uwagi" : "Preparat / szczepionka";
  const opisPh = {
    zabieg: "np. kastracja, usunięcie kamienia, szycie rany…",
    wscieklizna: "np. Nobivac Rabies, nr serii",
    zakazne: "np. Nobivac DHPPi+L4",
    pchly: "np. Bravecto, Simparica",
    pasozyty: "np. Milbemax, Drontal",
    waga: "opcjonalnie",
  }[f.typ];

  return (
    <Overlay onClose={onCancel} z="z-50">
      <div className={cx("w-full max-w-md max-h-[92vh] flex flex-col", PANEL)}>
        <ModalHead title={isEdit ? "Edytuj wpis" : "Nowy wpis"} onClose={onCancel}
          icon={<span className="text-teal-600">{(() => { const I = TYPE_ICONS[f.typ]; return <I size={17} />; })()}</span>} />
        <div className="p-5 overflow-y-auto space-y-4">
          {animal && <p className="text-sm text-stone-500 -mt-1">{animalTitle(animal)}{animal.chip ? ` · ${animal.chip}` : ""}</p>}

          <Field label="Rodzaj">
            <select value={f.typ} onChange={(e) => set("typ", e.target.value)} className={cx(INPUT, "appearance-none")}>
              {Object.entries(EVENT_TYPES).map(([id, t]) => <option key={id} value={id}>{t.label}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Data" required>
              <input type="date" value={f.data} onChange={(e) => set("data", e.target.value)} className={INPUT} />
            </Field>
            <Field label="Waga (kg)" required={f.typ === "waga"}>
              <input inputMode="decimal" value={f.waga} onChange={(e) => set("waga", e.target.value)}
                placeholder={f.typ === "waga" ? "np. 12,4" : "jeśli ważono"} className={INPUT} />
            </Field>
          </div>

          <Field label={opisLabel} required={f.typ === "zabieg"}>
            <textarea rows={2} value={f.opis} onChange={(e) => set("opis", e.target.value)}
              placeholder={opisPh} className={cx(INPUT, "resize-none")} />
          </Field>

          {meta.months && (
            <Field label="Następna dawka / ważne do"
              hint={`Domyślnie ${repeatText(meta.months)} od daty podania. Przypomnienie pojawi się ${meta.warn} dni przed terminem.`}>
              <input type="date" value={f.nastepny}
                onChange={(e) => { setNextTouched(true); set("nastepny", e.target.value); }} className={INPUT} />
            </Field>
          )}

          {err && <p className="text-sm text-red-500">{err}</p>}
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-stone-200 dark:border-stone-800">
          {isEdit && (
            <button onClick={remove} disabled={busy} aria-label="Usuń"
              className="rounded-xl bg-red-500/10 text-red-500 px-3 hover:bg-red-500/20 transition"><Trash2 size={16} /></button>
          )}
          <button onClick={onCancel} className={cx(BTN, "flex-1 py-2.5")}>Anuluj</button>
          <button onClick={submit} disabled={busy} className={cx(BTN_PRIMARY, "flex-1 py-2.5")}>
            {busy ? "Zapisywanie…" : "Zapisz"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

const NEW_GMINA = "__new__";
const capitalizeFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
function foldAscii(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L");
}
function genGminaCode(name, existingCodes) {
  const taken = new Set(existingCodes.map((c) => (c || "").toUpperCase()));
  const letters = foldAscii(name).toUpperCase().replace(/[^A-Z]/g, "");
  const base3 = (letters + "XXX").slice(0, 3);
  for (let n = 1; n < 10; n++) if (!taken.has(base3 + n)) return base3 + n;
  const base2 = (letters + "XX").slice(0, 2);
  for (let n = 10; n < 100; n++) if (!taken.has(base2 + n)) return base2 + n;
  return base3 + Math.floor(Math.random() * 10);
}

function EntryForm({ gminas, initial, onCancel, onSaved }) {
  const [f, setF] = useState(() => ({
    data_przyjecia: todayISO(), gmina_id: gminas[0]?.id || "", chip: "", opis: "",
    imie: "", plec: "nieznana", status: "schronisko", data_adopcji: "", adoptujacy: "",
    notatka: "", notatka_publiczna: false, waga_start: "",
    ...(initial || {}),
  }));
  const [photo, setPhoto] = useState(
    initial?.zdjecie ? { preview: initial.zdjecie, existing: true } : null
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [newGmina, setNewGmina] = useState("");
  const fileRef = useRef(null);
  const set = (k, v) => { setErr(""); setF((p) => ({ ...p, [k]: v })); };

  const setStatus = (v) => {
    // switching to adoption -> today's date as a sensible default
    setF((p) => ({ ...p, status: v, data_adopcji: v === "adopcja" && !p.data_adopcji ? todayISO() : p.data_adopcji }));
  };

  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const { blob, url } = await compressImage(file);
      const { blob: thumbBlob } = await compressImage(file, 320, 0.6);
      setPhoto({ blob, thumbBlob, preview: url, existing: false });
    } catch { setErr("Nie udało się przetworzyć zdjęcia."); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (!f.opis.trim()) return setErr("Podaj opis zwierzęcia.");

    let gminaId = f.gmina_id;
    let gminaName = "";

    if (gminaId === NEW_GMINA) {
      const name = capitalizeFirst(newGmina.trim());
      if (!name) return setErr("Wpisz nazwę nowej gminy.");
      setBusy(true); setErr("");
      const dupe = gminas.find((g) => g.name.toLowerCase() === name.toLowerCase());
      if (dupe) {
        gminaId = dupe.id; gminaName = dupe.name;
      } else {
        const newId = uid();
        const code = genGminaCode(name, gminas.map((g) => g.code));
        const list = [
          ...gminas.map((g) => ({ id: g.id, name: g.name, code: g.code })),
          { id: newId, name, code },
        ];
        const gr = await saveGminas(JSON.stringify(list));
        if (gr?.error) { setErr(gr.error); setBusy(false); return; }
        gminaId = newId; gminaName = name;
      }
    } else {
      if (!gminaId) return setErr("Wybierz gminę.");
      gminaName = gminas.find((x) => x.id === gminaId)?.name || "";
      setBusy(true); setErr("");
    }

    const fd = new FormData();
    ["data_przyjecia", "chip", "opis", "imie", "plec", "status", "data_adopcji", "adoptujacy", "notatka", "waga_start"]
      .forEach((k) => fd.append(k, f[k] || ""));
    fd.append("notatka_publiczna", f.notatka_publiczna ? "1" : "");
    fd.append("gmina_id", gminaId);
    fd.append("gmina_name", gminaName);
    if (photo?.blob) fd.append("photo", photo.blob, "photo.jpg");
    if (photo?.thumbBlob) fd.append("photo_thumb", photo.thumbBlob, "thumb.jpg");
    if (initial) {
      fd.append("id", initial.id);
      fd.append("existing_photo_path", initial.photo_path || "");
      if (!photo && initial.zdjecie) fd.append("removePhoto", "1");
    }
    const res = initial ? await updateAnimal(fd) : await createAnimal(fd);
    if (res?.error) { setErr(res.error); setBusy(false); return; }
    onSaved(initial ? null : res.id);
  };

  return (
    <Overlay onClose={onCancel}>
      <div className={cx("w-full max-w-lg max-h-[92vh] flex flex-col", PANEL)}>
        <ModalHead title={initial ? "Edytuj dane zwierzęcia" : "Przyjęcie zwierzęcia"} onClose={onCancel} />

        <div className="p-5 overflow-y-auto space-y-4">
          <div>
            <div className="mb-1.5"><FieldLabel>Zdjęcie</FieldLabel></div>
            {photo?.preview ? (
              <div className="relative">
                <img src={photo.preview} alt="" className="h-44 w-full object-cover rounded-xl" />
                <button onClick={() => setPhoto(null)} className="absolute top-2 right-2 h-8 w-8 grid place-items-center rounded-full bg-black/50 text-white hover:bg-black/70"><X size={16} /></button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()}
                className={cx("w-full h-28 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 grid place-items-center transition", SUBTLE_HOVER)}>
                <div className="flex flex-col items-center gap-1.5 text-sm text-stone-500 dark:text-stone-400">
                  {busy ? <span className="animate-pulse">Przetwarzanie…</span> : <><Upload size={22} /> Dodaj zdjęcie</>}
                </div>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Data przyjęcia">
              <input type="date" value={f.data_przyjecia || ""} onChange={(e) => set("data_przyjecia", e.target.value)} className={INPUT} />
            </Field>
            <Field label="Gmina" required>
              <select value={f.gmina_id} onChange={(e) => set("gmina_id", e.target.value)} className={cx(INPUT, "appearance-none")}>
                {gminas.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                <option value={NEW_GMINA}>➕ Dodaj gminę…</option>
              </select>
              {f.gmina_id === NEW_GMINA && (
                <input
                  autoFocus
                  value={newGmina}
                  onChange={(e) => { setNewGmina(e.target.value); setErr(""); }}
                  onBlur={() => setNewGmina((v) => capitalizeFirst(v.trim()))}
                  placeholder="Nazwa nowej gminy"
                  className={cx(INPUT, "mt-2")}
                />
              )}
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Imię">
              <input value={f.imie || ""} onChange={(e) => set("imie", e.target.value)} placeholder="np. Burek" className={INPUT} />
            </Field>
            <Field label="Płeć">
              <select value={f.plec} onChange={(e) => set("plec", e.target.value)} className={cx(INPUT, "appearance-none")}>
                {SEX.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Nadany mikrochip">
            <input value={f.chip || ""} onChange={(e) => set("chip", e.target.value.replace(/\s+/g, ""))}
              inputMode="numeric" placeholder="15 cyfr, np. 616093900146358" className={cx(INPUT, "font-mono")} />
          </Field>

          <Field label="Opis" required>
            <textarea rows={2} value={f.opis} onChange={(e) => set("opis", e.target.value)}
              placeholder="np. mix owczarka, czarny podpalany, ok. 3 lata, przyjazny" className={cx(INPUT, "resize-none")} />
          </Field>

          {!initial && (
            <Field label="Waga przy przyjęciu (kg)" hint="Pierwszy punkt historii wagi. Kolejne wpisuje się przy zabiegach.">
              <input inputMode="decimal" value={f.waga_start} onChange={(e) => set("waga_start", e.target.value)} placeholder="np. 18,5" className={INPUT} />
            </Field>
          )}

          <Field label="Status">
            <select value={f.status} onChange={(e) => setStatus(e.target.value)} className={cx(INPUT, "appearance-none")}>
              {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>

          {f.status === "adopcja" && (
            <div className="rounded-xl border border-teal-200 dark:border-teal-900/60 bg-teal-50/50 dark:bg-teal-950/20 p-3 space-y-3">
              <Field label="Data adopcji">
                <input type="date" value={f.data_adopcji || ""} onChange={(e) => set("data_adopcji", e.target.value)} className={INPUT} />
              </Field>
              <Field label="Dane osoby adoptującej"
                hint="Dane osobowe (RODO). Domyślnie ukryte na ekranie i na wydrukach.">
                <textarea rows={3} value={f.adoptujacy || ""} onChange={(e) => set("adoptujacy", e.target.value)}
                  placeholder={"Imię i nazwisko\nadres\ntelefon"} className={cx(INPUT, "resize-none")} />
              </Field>
            </div>
          )}

          <Field label="Notatka administratora">
            <textarea rows={2} value={f.notatka || ""} onChange={(e) => set("notatka", e.target.value)}
              placeholder="Notatka wewnętrzna — domyślnie widoczna tylko dla administratora"
              className={cx(INPUT, "resize-none")} />
            <label className="mt-2 flex items-center gap-2 text-sm text-stone-600 dark:text-stone-300 cursor-pointer select-none">
              <input type="checkbox" checked={!!f.notatka_publiczna}
                onChange={(e) => set("notatka_publiczna", e.target.checked)}
                className="h-4 w-4 rounded border-stone-300 text-teal-600 focus:ring-teal-500" />
              Widoczna również dla gminy
            </label>
          </Field>

          {err && <p className="text-sm text-red-500">{err}</p>}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-stone-200 dark:border-stone-800">
          <button onClick={onCancel} className={cx(BTN, "flex-1 py-2.5")}>Anuluj</button>
          <button onClick={submit} disabled={busy} className={cx(BTN_PRIMARY, "flex-1 py-2.5")}>
            {busy ? "Zapisywanie…" : "Zapisz"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

/* ======================== reminders / bulk ============================ */

// One tab per prophylaxis type. Every dog still in the shelter, most
// urgent on top; tick a bunch, log "given today" in one go.
// Runda na pchły to 30 psów — nobody does that one by one.
function RemindersPanel({ animals, today, isAdmin, onOpen, onClose, onSaved }) {
  const inShelter = useMemo(() => animals.filter((a) => a.status === "schronisko"), [animals]);
  const rank = { overdue: 0, soon: 1, none: 2, ok: 3 };

  const rowsFor = (typ) => inShelter
    .map((a) => ({ a, info: dueInfo(a.events, typ, today) }))
    .sort((x, y) => rank[x.info.state] - rank[y.info.state] || (x.info.due || "").localeCompare(y.info.due || ""));

  const counts = Object.fromEntries(PROFILAKTYKA.map((t) => {
    const r = rowsFor(t);
    return [t, { overdue: r.filter((x) => x.info.state === "overdue").length, soon: r.filter((x) => x.info.state === "soon").length }];
  }));

  const firstBusy = PROFILAKTYKA.find((t) => counts[t].overdue) || PROFILAKTYKA.find((t) => counts[t].soon) || "pchly";
  const [typ, setTyp] = useState(firstBusy);
  const rows = rowsFor(typ);

  const preselect = (list) => new Set(list.filter((r) => r.info.state === "overdue" || r.info.state === "soon").map((r) => r.a.id));
  const [picked, setPicked] = useState(() => preselect(rows));
  useEffect(() => { setPicked(preselect(rowsFor(typ))); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [typ]);

  const [data, setData] = useState(today);
  const [opis, setOpis] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const toggle = (id) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = rows.length > 0 && rows.every((r) => picked.has(r.a.id));

  const save = async () => {
    setBusy(true); setMsg("");
    const res = await saveEventBulk(JSON.stringify({ animal_ids: [...picked], typ, data, opis }));
    setBusy(false);
    if (res?.error) return setMsg(res.error);
    setPicked(new Set()); // they're done, nothing left to tick
    setMsg(`Zapisano dla ${res.count} ${res.count === 1 ? "zwierzęcia" : "zwierząt"}.`);
    setOpis("");
    onSaved();
  };

  return (
    <Overlay onClose={onClose}>
      <div className={cx("w-full max-w-2xl max-h-[92vh] flex flex-col", PANEL)}>
        <ModalHead title="Przypomnienia i profilaktyka" icon={<Bell size={18} />} onClose={onClose} />

        <div className="px-5 pt-4 flex gap-2 overflow-x-auto">
          {PROFILAKTYKA.map((t) => (
            <button key={t} onClick={() => { setTyp(t); setMsg(""); }}
              className={cx("shrink-0 rounded-xl px-3 py-2 text-sm font-medium transition border",
                typ === t ? "bg-teal-600 border-teal-600 text-white" : "border-stone-200 dark:border-stone-800 " + SUBTLE_HOVER)}>
              {EVENT_TYPES[t].short}
              {counts[t].overdue > 0 && <span className="ml-1.5 rounded-full bg-red-500 text-white px-1.5 text-[11px]">{counts[t].overdue}</span>}
              {counts[t].soon > 0 && <span className="ml-1 rounded-full bg-amber-400 text-amber-950 px-1.5 text-[11px]">{counts[t].soon}</span>}
            </button>
          ))}
        </div>

        <div className="px-5 pt-3 text-xs text-stone-500 dark:text-stone-400">
          {EVENT_TYPES[typ].label} — powtarzać {repeatText(EVENT_TYPES[typ].months)}. Zwierzęta w schronisku: {inShelter.length}.
        </div>

        <div className="p-5 pt-3 overflow-y-auto flex-1">
          {rows.length === 0 ? (
            <p className="text-sm text-stone-400">Brak zwierząt w schronisku.</p>
          ) : (
            <ul className="rounded-xl border border-stone-200 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800">
              {isAdmin && (
                <li className="px-3 py-2 flex items-center gap-3 bg-stone-50 dark:bg-stone-800/40 text-xs text-stone-500">
                  <input type="checkbox" checked={allOn}
                    onChange={() => setPicked(allOn ? new Set() : new Set(rows.map((r) => r.a.id)))}
                    className="h-4 w-4 rounded border-stone-300 text-teal-600 focus:ring-teal-500" />
                  zaznacz wszystkie
                </li>
              )}
              {rows.map(({ a, info }) => (
                <li key={a.id} className="px-3 py-2 flex items-center gap-3">
                  {isAdmin && (
                    <input type="checkbox" checked={picked.has(a.id)} onChange={() => toggle(a.id)}
                      className="h-4 w-4 rounded border-stone-300 text-teal-600 focus:ring-teal-500" />
                  )}
                  <Photo src={a.zdjecie} className="h-9 w-9 rounded-lg shrink-0" iconSize={14} />
                  <button onClick={() => onOpen(a.id)} className="min-w-0 flex-1 text-left">
                    <div className="text-sm font-medium truncate hover:underline">{a.imie || a.opis}</div>
                    <div className="text-[11px] text-stone-400 truncate">
                      {a.gmina_name}{a.chip ? ` · ${a.chip}` : ""}
                      {info.last && ` · ostatnio ${fmtDate(info.last.data)}${info.last.opis ? ` (${info.last.opis})` : ""}`}
                    </div>
                  </button>
                  <span className={cx("shrink-0 rounded-lg px-2 py-1 ring-1 text-xs font-medium whitespace-nowrap", DUE_COLORS[info.state])}>
                    {info.state === "none" ? "nigdy" : info.state === "ok" ? `do ${fmtDate(info.due)}` : dueText(info)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {isAdmin && rows.length > 0 && (
          <div className="px-5 py-4 border-t border-stone-200 dark:border-stone-800 space-y-2">
            <div className="flex gap-2">
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={cx(INPUT_FREE, "w-40 shrink-0 py-2")} />
              <input value={opis} onChange={(e) => setOpis(e.target.value)} placeholder="Preparat (opcjonalnie)" className={cx(INPUT, "flex-1 py-2")} />
            </div>
            <div className="flex items-center gap-2">
              {msg && <span className="text-sm text-teal-700 dark:text-teal-300">{msg}</span>}
              <button onClick={save} disabled={busy || picked.size === 0} className={cx(BTN_PRIMARY, "ml-auto py-2.5")}>
                <Check size={15} /> {busy ? "Zapisywanie…" : `Zapisz podanie (${picked.size})`}
              </button>
            </div>
          </div>
        )}
      </div>
    </Overlay>
  );
}

/* ============================ settings ================================ */

function SettingsPanel({ gminas, settings, exportPending, lastExportSentAt, selectedGmina, onClose, onSaved, onAcknowledged, onWipe }) {
  const [list, setList] = useState(gminas.map((g) => ({ ...g })));
  const [org, setOrg] = useState(settings?.org_name || "");
  const [gminaSees, setGminaSees] = useState(!!settings?.gmina_widzi_adoptujacych);
  const [busy, setBusy] = useState(false);
  const [acking, setAcking] = useState(false);
  const [msg, setMsg] = useState("");
  const [exportGmina, setExportGmina] = useState(selectedGmina || "");
  const exportHref = (fmt, extra = "") =>
    `/api/export?format=${fmt}${exportGmina ? `&gmina=${exportGmina}` : ""}${extra}`;
  const upd = (id, k, v) => setList((p) => p.map((g) => (g.id === id ? { ...g, [k]: v } : g)));
  const add = () => setList((p) => [...p, { id: uid(), name: "", code: "" }]);
  const rm = (id) => setList((p) => p.filter((g) => g.id !== id));

  const sentLabel = lastExportSentAt ? plLongDate(lastExportSentAt) : null;

  const acknowledge = async () => {
    setAcking(true);
    const res = await acknowledgeExport();
    if (res?.error) { setMsg(res.error); setAcking(false); return; }
    onAcknowledged();
  };

  const save = async () => {
    setBusy(true); setMsg("");
    const s = await saveSettings(JSON.stringify({ org_name: org, gmina_widzi_adoptujacych: gminaSees }));
    if (s?.error) { setMsg(s.error); setBusy(false); return; }
    const res = await saveGminas(JSON.stringify(list));
    if (res?.error) { setMsg(res.error); setBusy(false); return; }
    if (res?.warning) { setMsg(res.warning); setBusy(false); return; }
    onSaved();
  };

  return (
    <Overlay onClose={onClose}>
      <div className={cx("w-full max-w-lg max-h-[92vh] flex flex-col", PANEL)}>
        <ModalHead title="Ustawienia" icon={<Settings size={18} />} onClose={onClose} />

        <div className="p-5 overflow-y-auto space-y-6">
          <Field label="Nazwa schroniska / organizacji" hint="Widoczna w nagłówku, na ekranie logowania, wydrukach i e-mailach.">
            <input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="np. Schronisko dla zwierząt w …" className={INPUT} />
          </Field>

          <div className="rounded-xl border border-stone-200 dark:border-stone-800 p-4">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input type="checkbox" checked={gminaSees} onChange={(e) => setGminaSees(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-stone-300 text-teal-600 focus:ring-teal-500" />
              <span>
                <span className="text-sm font-medium flex items-center gap-1.5"><Lock size={14} /> Gminy widzą dane adoptujących</span>
                <span className="block text-xs mt-0.5 text-stone-500 dark:text-stone-400">
                  Domyślnie wyłączone (RODO). Gdy wyłączone, dane osobowe w ogóle nie są wysyłane do przeglądarki gminy.
                </span>
              </span>
            </label>
          </div>

          <div>
            <FieldLabel>Kopia zapasowa</FieldLabel>
            {exportPending ? (
              <div className="mt-2 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-4">
                <div className="flex gap-3">
                  <ShieldAlert size={18} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Nowa kopia zapasowa</p>
                    <p className="text-xs mt-0.5 text-amber-800 dark:text-amber-300">
                      Wysłano na e-mail{sentLabel ? ` ${sentLabel}` : ""}. Zapisz pliki i potwierdź, aby wyłączyć przypomnienie.
                    </p>
                  </div>
                </div>
                <button onClick={acknowledge} disabled={acking} className={cx(BTN_PRIMARY, "mt-3")}>
                  <Check size={15} /> {acking ? "Potwierdzanie…" : "Potwierdzam kopię"}
                </button>
              </div>
            ) : (
              <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                {sentLabel ? `Ostatnia kopia wysłana e-mailem: ${sentLabel}.` : "Kopia zapasowa wysyłana jest e-mailem co 5 dni."}
              </p>
            )}
            <div className="mt-3">
              <select value={exportGmina} onChange={(e) => setExportGmina(e.target.value)}
                className={cx(INPUT, "appearance-none")}>
                <option value="">Wszystkie gminy</option>
                {gminas.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <div className="mt-2 flex flex-wrap gap-2">
                <a href={exportHref("xlsx")} className={BTN}><Download size={15} /> Excel</a>
                <a href={exportHref("csv")} className={BTN}><Download size={15} /> CSV – zwierzęta</a>
                <a href={exportHref("csv", "&sheet=historia")} className={BTN}><Download size={15} /> CSV – historia leczenia</a>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <FieldLabel>Gminy i ich kody</FieldLabel>
              <button onClick={add} className="text-xs font-medium text-teal-600 inline-flex items-center gap-1"><Plus size={13} /> Dodaj</button>
            </div>
            <div className="space-y-2">
              {list.map((g) => (
                <div key={g.id} className="flex gap-2">
                  <input value={g.name} onChange={(e) => upd(g.id, "name", e.target.value)} placeholder="Nazwa gminy" className={cx(INPUT, "flex-1 py-2")} />
                  <input value={g.code} onChange={(e) => upd(g.id, "code", e.target.value)} placeholder="KOD" maxLength={8}
                    className={cx(INPUT, "w-24 py-2 text-center uppercase tracking-wider")} />
                  <button onClick={() => rm(g.id)} className={cx("px-2.5 rounded-xl text-red-500 transition", SUBTLE_HOVER)}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-stone-400 dark:text-stone-500">
              Każdej gminie przekaż jej kod. Widzi wtedy tylko swoje zwierzęta (tylko do odczytu).
            </p>
          </div>

          <div className="rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-4">
            <p className="text-sm font-medium">Kod administratora</p>
            <p className="text-xs mt-1 text-stone-500 dark:text-stone-400">
              Ustawiany w zmiennej <code className="rounded bg-stone-100 dark:bg-stone-800 px-1">ADMIN_CODE</code>.
              Zmiana wymaga ponownego uruchomienia aplikacji.
            </p>
          </div>

          <div className="rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-4">
            <p className="text-sm font-medium">Strefa niebezpieczna</p>
            <p className="text-xs mt-1 mb-3 text-stone-500 dark:text-stone-400">Trwale usuwa wszystkie zwierzęta razem z historią leczenia.</p>
            <button onClick={onWipe} className="inline-flex items-center gap-2 rounded-xl bg-red-500/10 text-red-500 px-3 py-2 text-sm font-medium hover:bg-red-500/20 transition">
              <Trash2 size={15} /> Wyczyść wszystkie wpisy
            </button>
          </div>

          {msg && <p className="text-sm text-amber-600 dark:text-amber-400">{msg}</p>}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-stone-200 dark:border-stone-800">
          <button onClick={onClose} className={cx(BTN, "flex-1 py-2.5")}>Zamknij</button>
          <button onClick={save} disabled={busy} className={cx(BTN_PRIMARY, "flex-1 py-2.5")}>
            {busy ? "Zapisywanie…" : "Zapisz ustawienia"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
