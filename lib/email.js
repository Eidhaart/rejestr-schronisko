import "server-only";
import nodemailer from "nodemailer";
import { buildCsv, buildEventsCsv, buildXlsx, exportFilename } from "./export";
import { EVENT_TYPES, fmtDate, dueText } from "./care";

// Plain SMTP from a mailbox that already exists. Ingen ny domän, no
// Sendgrid, nothing to sign up for.

export function mailConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.CLIENT_EMAIL);
}

function transport() {
  if (!mailConfigured()) {
    throw new Error("Brak konfiguracji e-mail (SMTP_HOST / SMTP_USER / SMTP_PASS / CLIENT_EMAIL).");
  }
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = SSL, 587 = STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const shell = (title, body) => `
  <div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1c1917">
    <div style="background:#0d9488;color:#fff;padding:20px 24px;border-radius:14px 14px 0 0">
      <h1 style="margin:0;font-size:18px">${title}</h1>
    </div>
    <div style="border:1px solid #e7e5e4;border-top:none;padding:24px;border-radius:0 0 14px 14px">
      ${body}
    </div>
  </div>`;

export async function sendBackupEmail(animals, org) {
  const count = animals.length;
  const today = new Date().toLocaleDateString("pl-PL");

  const html = shell(`Kopia zapasowa – ${esc(org)}`, `
    <p style="margin:0 0 12px">Dzień dobry,</p>
    <p style="margin:0 0 12px">
      W załączniku aktualne dane z ewidencji (<strong>${count}</strong> ${count === 1 ? "zwierzę" : "zwierząt"})
      na dzień <strong>${today}</strong>: plik <strong>Excel</strong> (dwie zakładki: zwierzęta i historia leczenia)
      oraz dwa pliki <strong>CSV</strong>.
    </p>
    <p style="margin:0 0 12px">
      Pliki zawierają dane osobowe osób adoptujących — prosimy przechowywać je w bezpiecznym miejscu.
    </p>
    <p style="margin:0 0 4px">Po zapisaniu można potwierdzić kopię w Ustawieniach aplikacji.</p>
    <p style="margin:16px 0 0;font-size:12px;color:#78716c">Wiadomość wysyłana automatycznie co 5 dni.</p>`);

  return transport().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: process.env.CLIENT_EMAIL,
    subject: `Kopia zapasowa – ${org} – ${today}`,
    html,
    attachments: [
      { filename: exportFilename("xlsx"), content: buildXlsx(animals) },
      { filename: exportFilename("csv"), content: Buffer.from(buildCsv(animals), "utf-8") },
      { filename: exportFilename("csv", "-historia"), content: Buffer.from(buildEventsCsv(animals), "utf-8") },
    ],
  });
}

// items = output of collectReminders()
export async function sendReminderEmail(items, org, appUrl) {
  const rows = items.map((r) => {
    const late = r.state === "overdue";
    return `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee"><strong>${esc(r.animal.imie || r.animal.opis)}</strong><br>
          <span style="color:#78716c;font-size:12px">${esc(r.animal.gmina_name || "")}${r.animal.chip ? " · " + esc(r.animal.chip) : ""}</span></td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(EVENT_TYPES[r.typ].label)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;white-space:nowrap;color:${late ? "#b91c1c" : "#a16207"}">
          ${fmtDate(r.due)}<br><span style="font-size:12px">${dueText(r)}</span></td>
      </tr>`;
  }).join("");

  const late = items.filter((r) => r.state === "overdue").length;
  const html = shell(`Przypomnienie – profilaktyka`, `
    <p style="margin:0 0 12px">Dzień dobry,</p>
    <p style="margin:0 0 14px">
      ${late ? `<strong style="color:#b91c1c">${late} po terminie</strong>, ` : ""}łącznie <strong>${items.length}</strong>
      ${items.length === 1 ? "pozycja wymaga" : "pozycji wymaga"} uwagi:
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
    ${appUrl ? `<p style="margin:18px 0 0"><a href="${esc(appUrl)}" style="color:#0d9488;font-weight:600">Otwórz aplikację →</a></p>` : ""}
    <p style="margin:16px 0 0;font-size:12px;color:#78716c">
      Każda pozycja przychodzi raz. Po wpisaniu nowej dawki przypomnienie samo zniknie.
    </p>`);

  return transport().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: process.env.REMINDER_EMAIL || process.env.CLIENT_EMAIL,
    subject: `${late ? "⚠ " : ""}Profilaktyka: ${items.length} do zrobienia – ${org}`,
    html,
  });
}
