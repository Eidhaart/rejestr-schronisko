// Wszystko o leczeniu, profilaktyce i przypomnieniach.
// No "server-only" on purpose — dashboard, print pages and the cron email
// all need the same date maths. En sanning, ett ställe.

export const STATUSES = [
  { id: "schronisko", label: "W schronisku" },
  { id: "adopcja",    label: "Adoptowany" },
  { id: "zwrocony",   label: "Zwrócony właścicielowi" },
  { id: "inny",       label: "Inny" },
];
export const statusLabel = (id) => STATUSES.find((s) => s.id === id)?.label || id || "—";

export const SEX = [
  { id: "samiec",   label: "Samiec" },
  { id: "samica",   label: "Samica" },
  { id: "nieznana", label: "Nieustalona" },
];
export const sexLabel = (id) => SEX.find((s) => s.id === id)?.label || "—";

// months = co ile powtarzać (null = jednorazowo, no reminder)
// warn   = how many days before the date we start nagging
export const EVENT_TYPES = {
  zabieg:      { label: "Zabieg weterynaryjny",               short: "Zabieg",           months: null },
  wscieklizna: { label: "Szczepienie przeciw wściekliźnie",   short: "Wścieklizna",      months: 12, warn: 30 },
  zakazne:     { label: "Szczepienie – choroby zakaźne",      short: "Choroby zakaźne",  months: 12, warn: 30 },
  pchly:       { label: "Profilaktyka – pchły i kleszcze",    short: "Pchły i kleszcze", months: 1,  warn: 5 },
  pasozyty:    { label: "Profilaktyka – pasożyty wewnętrzne", short: "Pasożyty wewn.",   months: 6,  warn: 14 },
  waga:        { label: "Ważenie",                            short: "Waga",             months: null },
};
export const PROFILAKTYKA = ["wscieklizna", "zakazne", "pchly", "pasozyty"];

/* ------------------------------ dates ------------------------------- */
// Dates are kept as plain "YYYY-MM-DD" strings end to end. No Date objects
// floating around = no timezone surprises (Vercel runs in UTC, the client
// is in Poland, and a vaccine date must not jump a day).

export function todayISO() {
  // sv-SE råkar ge YYYY-MM-DD. Swedish locale, Polish time. Działa.
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date());
}

export function addMonths(iso, n) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const total = (m - 1) + n;
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  // 31 stycznia + 1 miesiąc = koniec lutego, not 3 March
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

export function daysBetween(a, b) {
  const t = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 86400000);
}

export function fmtDate(d) {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}.${m}.${y}`;
}

const PL_MONTHS = [
  "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
  "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
];
export function plLongDate(value) {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  return `${dt.getDate()} ${PL_MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}

/* ------------------------------ events ------------------------------ */

// newest first; same day -> the one entered later wins
export function sortEvents(events) {
  return [...(events || [])].sort((a, b) =>
    (b.data || "").localeCompare(a.data || "") ||
    String(b.created_at || "").localeCompare(String(a.created_at || ""))
  );
}

export const eventsOf = (events, typ) => sortEvents(events).filter((e) => e.typ === typ);

// When is the next dose due, if it was given on `data`?
export function defaultNext(typ, data) {
  const t = EVENT_TYPES[typ];
  return t?.months && data ? addMonths(data, t.months) : null;
}

// state: none | ok | soon | overdue
export function dueInfo(events, typ, today = todayISO()) {
  const last = eventsOf(events, typ)[0] || null;
  if (!last) return { last: null, due: null, state: "none", days: null };
  const due = last.nastepny || defaultNext(typ, last.data);
  if (!due) return { last, due: null, state: "ok", days: null };
  const days = daysBetween(today, due);
  const warn = EVENT_TYPES[typ]?.warn ?? 7;
  const state = days < 0 ? "overdue" : days <= warn ? "soon" : "ok";
  return { last, due, state, days };
}

// Oldest -> newest, only entries that actually have a weight.
// Any event can carry a weight (vets weigh the dog at every visit).
export function weightHistory(events) {
  return sortEvents(events)
    .filter((e) => e.waga !== null && e.waga !== undefined && e.waga !== "")
    .reverse()
    .map((e) => ({ data: e.data, waga: Number(e.waga), typ: e.typ, id: e.id }));
}

// Everything that needs attention, across all animals still in the shelter.
// Adopted ones have a home now — their calendar belongs to someone else.
export function collectReminders(animals, today = todayISO()) {
  const out = [];
  for (const a of animals || []) {
    if (a.status !== "schronisko") continue;
    for (const typ of PROFILAKTYKA) {
      const info = dueInfo(a.events, typ, today);
      if (info.state === "soon" || info.state === "overdue") out.push({ animal: a, typ, ...info });
    }
  }
  return out.sort((x, y) => x.due.localeCompare(y.due));
}

export function dueText(info) {
  if (!info || info.state === "none") return "brak wpisu";
  if (!info.due) return "";
  if (info.days < 0) return `po terminie ${-info.days} dni`;
  if (info.days === 0) return "termin dziś";
  return `za ${info.days} dni`;
}

export const animalTitle = (a) => a?.imie ? `${a.imie}` : (a?.opis || "Bez imienia");

export const parseWeight = (v) => {
  if (v === null || v === undefined) return null;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 && n < 200 ? Math.round(n * 100) / 100 : null;
};
