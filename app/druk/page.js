import { getSession } from "../../lib/session";
import { getServiceClient } from "../../lib/supabase";
import { loadAnimals, loadSettings, orgName, seesAdopters } from "../../lib/data";
import {
  fmtDate, plLongDate, statusLabel, sexLabel, eventsOf, dueInfo, weightHistory, todayISO,
} from "../../lib/care";
import PrintToolbar from "./PrintToolbar";

export const dynamic = "force-dynamic";

const kg = (n) => (n == null ? "—" : `${String(n).replace(".", ",")} kg`);

export default async function PrintPage({ searchParams }) {
  const session = getSession();
  if (!session) return <Notice text="Musisz być zalogowany, aby wydrukować rejestr." />;

  const settings = await loadSettings();

  // gmina widzi swoją gminę. The URL can say whatever it likes.
  let gminaId = null;
  let gminaName = null;
  if (session.role === "gmina") {
    gminaName = session.gminaName;
  } else if (searchParams?.gmina) {
    gminaId = searchParams.gmina;
    const { data: g } = await getServiceClient().from("gminas").select("name").eq("id", gminaId).single();
    gminaName = g?.name || null;
  }

  const rok = (searchParams?.rok || "").toString();
  const status = (searchParams?.status || "").toString();
  const withPhotos = searchParams?.foto !== "0";
  // RODO: off unless explicitly turned on AND this session may see it at all
  const mayShowAdopter = seesAdopters(session, settings);
  const withAdopter = mayShowAdopter && searchParams?.rodo === "1";

  let rows;
  try {
    rows = await loadAnimals(session, { gminaId, settings });
  } catch (e) {
    return <Notice text={"Błąd bazy danych: " + e.message} />;
  }

  rows = rows
    .filter((a) => (rok === "brak" ? !a.data_przyjecia : /^\d{4}$/.test(rok) ? a.data_przyjecia?.startsWith(rok) : true))
    .filter((a) => (status ? a.status === status : true))
    .sort((x, y) => (x.data_przyjecia || "9999").localeCompare(y.data_przyjecia || "9999"));

  const today = todayISO();
  const showAdoptCols = rows.some((a) => a.status === "adopcja");

  const toggles = [{ key: "foto", on: withPhotos, labelOn: "Ze zdjęciami", labelOff: "Bez zdjęć" }];
  if (mayShowAdopter && showAdoptCols) {
    toggles.push({ key: "rodo", on: withAdopter, labelOn: "Z danymi adoptujących", labelOff: "Ukryj dane (RODO)" });
  }

  const scope = [
    gminaName ? <>gmina <strong>{gminaName}</strong></> : <>wszystkie gminy</>,
    /^\d{4}$/.test(rok) ? <>, przyjęte w <strong>{rok}</strong> r.</> : rok === "brak" ? <>, bez daty przyjęcia</> : null,
    status ? <> · {statusLabel(status).toLowerCase()}</> : null,
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <PrintToolbar toggles={toggles} />

      <div className="page">
        <header className="doc-head">
          <div className="doc-top">
            <span>{orgName(settings)}</span>
            <span>dnia {plLongDate(new Date())} r.</span>
          </div>
          <h1 className="doc-title">Ewidencja zwierząt</h1>
          <p className="doc-sub">{scope}</p>
          <div className="rule" />
        </header>

        {rows.length === 0 ? (
          <p className="empty">Brak wpisów dla wybranych filtrów.</p>
        ) : (
          <table className="reg">
            <thead>
              <tr>
                <th>lp</th>
                <th>data przyjęcia</th>
                {!gminaName && <th>gmina</th>}
                <th>mikrochip</th>
                <th>imię / opis</th>
                <th>płeć</th>
                <th>zabiegi weterynaryjne</th>
                <th>wścieklizna</th>
                <th>choroby zakaźne</th>
                <th>pchły / kleszcze</th>
                <th>pasożyty wewn.</th>
                <th>waga</th>
                <th>status</th>
                {showAdoptCols && <th>data adopcji</th>}
                {withAdopter && <th>dane adoptującego</th>}
                {withPhotos && <th>zdjęcie</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((a, i) => {
                const zab = eventsOf(a.events, "zabieg");
                const w = weightHistory(a.events).pop();
                return (
                  <tr key={a.id}>
                    <td className="c">{i + 1}</td>
                    <td className="c nw">{fmtDate(a.data_przyjecia)}</td>
                    {!gminaName && <td>{a.gmina_name}</td>}
                    <td className="mono">{a.chip || "—"}</td>
                    <td><strong>{a.imie || "—"}</strong><br />{a.opis}</td>
                    <td className="c">{sexLabel(a.plec)}</td>
                    <td className="small">
                      {zab.length
                        ? zab.map((z) => <div key={z.id}>{fmtDate(z.data)} – {z.opis}</div>)
                        : "—"}
                    </td>
                    {["wscieklizna", "zakazne", "pchly", "pasozyty"].map((t) => {
                      const info = dueInfo(a.events, t, today);
                      const late = a.status === "schronisko" && info.state === "overdue";
                      return (
                        <td key={t} className="c small nw">
                          {info.last ? (
                            <>
                              {fmtDate(info.last.data)}
                              {info.due && <div className={late ? "late" : "muted"}>do {fmtDate(info.due)}</div>}
                            </>
                          ) : "—"}
                        </td>
                      );
                    })}
                    <td className="c nw">{w ? <>{kg(w.waga)}<div className="muted small">{fmtDate(w.data)}</div></> : "—"}</td>
                    <td className="c">{statusLabel(a.status)}</td>
                    {showAdoptCols && <td className="c nw">{a.status === "adopcja" ? fmtDate(a.data_adopcji) : ""}</td>}
                    {withAdopter && <td className="small pre">{a.adoptujacy || ""}</td>}
                    {withPhotos && (
                      <td className="photo">{a.zdjecie ? <img src={a.zdjecie} alt="" /> : <span className="muted small">brak</span>}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="summary">
          Liczba zwierząt w zestawieniu: <strong>{rows.length}</strong>
          {showAdoptCols && !withAdopter && <span className="muted"> · dane osób adoptujących pominięto (RODO)</span>}
        </div>

        <div className="sign">
          <div className="sign-line" />
          <div className="sign-label">data i podpis osoby sporządzającej</div>
        </div>
      </div>
    </>
  );
}

function Notice({ text }) {
  return (
    <div style={{ padding: 40, fontFamily: "system-ui, sans-serif", color: "#1c1917" }}>
      <p>{text}</p>
    </div>
  );
}

// Poziomo — 15+ columns don't fit portrait, no matter how you squint.
const css = `
  @page { size: A4 landscape; margin: 10mm 9mm; }

  html, body { background: #f4f4f2; margin: 0; padding: 0; color: #111; }

  .page {
    background: #fff;
    max-width: 1200px;
    margin: 24px auto 60px;
    padding: 28px 32px 40px;
    box-shadow: 0 1px 4px rgba(0,0,0,.14);
    font-family: "Segoe UI", system-ui, Arial, sans-serif;
    color: #1a1a1a;
  }

  .doc-head { margin-bottom: 14px; }
  .doc-top { display: flex; justify-content: space-between; font-size: 9pt; color: #444; margin: 0 0 10px; }
  .doc-title {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 16pt; font-weight: 700; letter-spacing: .5px;
    text-align: center; text-transform: uppercase; margin: 0; line-height: 1.25;
  }
  .doc-sub { text-align: center; font-size: 10pt; color: #333; margin: 4px 0 0; }
  .rule { height: 2px; background: #1f2937; margin: 12px 0 0; }

  table.reg { width: 100%; border-collapse: collapse; font-size: 8pt; }
  table.reg th {
    background: #cfe3d4; border: 0.75pt solid #9ca3af; padding: 4px 4px;
    font-weight: 700; text-align: center; vertical-align: middle; font-size: 7.5pt;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  table.reg td { border: 0.75pt solid #c4c4bf; padding: 3px 4px; vertical-align: top; line-height: 1.3; }
  table.reg tr { break-inside: avoid; page-break-inside: avoid; }
  table.reg thead { display: table-header-group; }
  .c { text-align: center; }
  .nw { white-space: nowrap; }
  .mono { font-variant-numeric: tabular-nums; word-break: break-all; font-size: 7.5pt; }
  .small { font-size: 7.5pt; }
  .pre { white-space: pre-wrap; }
  .muted { color: #8a8a86; }
  .late { color: #b91c1c; font-weight: 700; }
  td.photo { width: 90px; padding: 2px; text-align: center; }
  td.photo img { width: 86px; height: 64px; object-fit: cover; display: block; border-radius: 2px; }

  .empty { font-size: 10.5pt; padding: 24px 0; text-align: center; color: #444; }
  .summary { margin-top: 12px; font-size: 9pt; }

  .sign { margin-top: 40px; width: 260px; margin-left: auto; text-align: center; break-inside: avoid; }
  .sign-line { border-bottom: 0.75pt solid #4b5563; height: 0; }
  .sign-label { font-size: 8.5pt; color: #444; margin-top: 5px; }

  @media print {
    .no-print { display: none !important; }
    html, body { background: #fff; }
    .page { box-shadow: none; margin: 0; padding: 0; max-width: none; width: auto; }
  }
`;
