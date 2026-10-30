import "server-only";
import * as XLSX from "xlsx";
import {
  EVENT_TYPES, PROFILAKTYKA, statusLabel, sexLabel, eventsOf, dueInfo, weightHistory, sortEvents,
} from "./care";

// Backup = the whole truth, adopter data included. It only goes to the admin
// (download) or to the client's own inbox, never to a gmina.

const lastOf = (a, t) => eventsOf(a.events, t)[0];

const ANIMAL_COLUMNS = [
  ["Data przyjęcia", (a) => a.data_przyjecia || ""],
  ["Gmina", (a) => a.gmina_name || ""],
  ["Mikrochip", (a) => a.chip || ""],
  ["Opis", (a) => a.opis || ""],
  ["Imię", (a) => a.imie || ""],
  ["Płeć", (a) => sexLabel(a.plec)],
  ["Zabiegi weterynaryjne", (a) => eventsOf(a.events, "zabieg").reverse().map((z) => `${z.data} ${z.opis || ""}`.trim()).join(" | ")],
  ...PROFILAKTYKA.flatMap((t) => [
    [`${EVENT_TYPES[t].short} – ostatnio`, (a) => lastOf(a, t)?.data || ""],
    [`${EVENT_TYPES[t].short} – następne`, (a) => dueInfo(a.events, t).due || ""],
  ]),
  ["Waga aktualna (kg)", (a) => weightHistory(a.events).pop()?.waga ?? ""],
  ["Status", (a) => statusLabel(a.status)],
  ["Data adopcji", (a) => a.data_adopcji || ""],
  ["Dane adoptującego", (a) => a.adoptujacy || ""],
  ["Notatka", (a) => a.notatka || ""],
  ["Zdjęcie (URL)", (a) => a.zdjecie || ""],
];

// one row per event, so nothing is lost in a "joined with |" cell
const EVENT_COLUMNS = [
  ["Mikrochip", (e, a) => a.chip || ""],
  ["Imię", (e, a) => a.imie || ""],
  ["Gmina", (e, a) => a.gmina_name || ""],
  ["Rodzaj", (e) => EVENT_TYPES[e.typ]?.label || e.typ],
  ["Data", (e) => e.data || ""],
  ["Opis / preparat", (e) => e.opis || ""],
  ["Waga (kg)", (e) => e.waga ?? ""],
  ["Następna dawka", (e) => e.nastepny || ""],
];

const animalRows = (animals) => animals.map((a) => ANIMAL_COLUMNS.map(([, get]) => get(a)));
const eventRows = (animals) =>
  animals.flatMap((a) => sortEvents(a.events).reverse().map((e) => EVENT_COLUMNS.map(([, get]) => get(e, a))));

function toCsv(header, rows) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM, annars Excel turns every "ł" into garbage
  return "﻿" + [header, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
}

export const buildCsv = (animals) => toCsv(ANIMAL_COLUMNS.map(([l]) => l), animalRows(animals));
export const buildEventsCsv = (animals) => toCsv(EVENT_COLUMNS.map(([l]) => l), eventRows(animals));

export function buildXlsx(animals) {
  const wb = XLSX.utils.book_new();

  const ws = XLSX.utils.aoa_to_sheet([ANIMAL_COLUMNS.map(([l]) => l), ...animalRows(animals)]);
  ws["!cols"] = ANIMAL_COLUMNS.map(([l]) => ({ wch: Math.max(12, Math.min(40, l.length + 4)) }));
  XLSX.utils.book_append_sheet(wb, ws, "Zwierzęta");

  const ws2 = XLSX.utils.aoa_to_sheet([EVENT_COLUMNS.map(([l]) => l), ...eventRows(animals)]);
  ws2["!cols"] = [18, 14, 14, 32, 12, 36, 10, 14].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws2, "Historia leczenia");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

export function exportFilename(ext, suffix = "") {
  const d = new Date().toISOString().slice(0, 10);
  return `rejestr-schroniska${suffix}-${d}.${ext}`;
}
