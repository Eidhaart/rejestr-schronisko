import { getSession } from "../../../lib/session";
import { loadAnimals, loadSettings, orgName, seesAdopters } from "../../../lib/data";
import {
  fmtDate, plLongDate, statusLabel, sexLabel, eventsOf, dueInfo, weightHistory,
  EVENT_TYPES, PROFILAKTYKA, todayISO,
} from "../../../lib/care";
import PrintToolbar from "../PrintToolbar";

export const dynamic = "force-dynamic";

const kg = (n) => (n == null ? "—" : `${String(n).replace(".", ",")} kg`);

// Karta zwierzęcia — the "everything about this one dog" sheet,
// the kind you hand over together with the dog at adoption.
export default async function SingleEntryPrint({ searchParams }) {
  const session = getSession();
  if (!session) return <Notice text="Musisz być zalogowany, aby wydrukować kartę." />;

  const id = (searchParams?.id || "").toString();
  if (!id) return <Notice text="Brak identyfikatora wpisu." />;

  const settings = await loadSettings();
  let a;
  try {
    // loadAnimals already locks a gmina to its own rows, so a foreign id just comes back empty
    [a] = await loadAnimals(session, { id, settings });
  } catch (e) {
    return <Notice text={"Błąd bazy danych: " + e.message} />;
  }
  if (!a) return <Notice text="Nie znaleziono wpisu albo brak dostępu." />;

  const today = todayISO();
  const mayShowAdopter = seesAdopters(session, settings) && a.status === "adopcja";
  const withAdopter = mayShowAdopter && searchParams?.rodo === "1";
  const withPhotos = searchParams?.foto !== "0";
  const showNote = a.notatka && (session.role === "admin" ? searchParams?.notatka === "1" || a.notatka_publiczna : a.notatka_publiczna);

  const toggles = [{ key: "foto", on: withPhotos, labelOn: "Ze zdjęciem", labelOff: "Bez zdjęcia" }];
  if (mayShowAdopter) toggles.push({ key: "rodo", on: withAdopter, labelOn: "Z danymi adoptującego", labelOff: "Ukryj dane (RODO)" });

  const zabiegi = eventsOf(a.events, "zabieg");
  const weights = weightHistory(a.events);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <PrintToolbar toggles={toggles} />

      <div className="sheet">
        <header className="head">
          <div>
            <div className="org">{orgName(settings)}</div>
            <h1>Karta zwierzęcia</h1>
          </div>
          <div className="when">dnia {plLongDate(new Date())} r.</div>
        </header>

        <section className="top">
          {withPhotos && (
            <div className="photo">{a.zdjecie ? <img src={a.zdjecie} alt="" /> : <div className="nophoto">brak zdjęcia</div>}</div>
          )}
          <dl className="fields">
            <Row label="Imię" value={a.imie} strong />
            <Row label="Opis" value={a.opis} />
            <Row label="Płeć" value={sexLabel(a.plec)} />
            <Row label="Mikrochip" value={a.chip} mono />
            <Row label="Data przyjęcia" value={fmtDate(a.data_przyjecia)} />
            <Row label="Gmina" value={a.gmina_name} />
            <Row label="Status" value={statusLabel(a.status)} />
            {a.status === "adopcja" && <Row label="Data adopcji" value={fmtDate(a.data_adopcji)} />}
            {a.status === "adopcja" && (
              <Row label="Osoba adoptująca"
                value={withAdopter ? a.adoptujacy : <span className="muted">dane ukryte (RODO)</span>} pre />
            )}
            <Row label="Aktualna waga" value={weights.length ? `${kg(weights.at(-1).waga)} (${fmtDate(weights.at(-1).data)})` : null} />
          </dl>
        </section>

        <h2>Zabiegi weterynaryjne</h2>
        {zabiegi.length ? (
          <table className="t">
            <thead><tr><th style={{ width: 90 }}>data</th><th>zabieg</th><th style={{ width: 70 }}>waga</th></tr></thead>
            <tbody>
              {[...zabiegi].reverse().map((z) => (
                <tr key={z.id}><td>{fmtDate(z.data)}</td><td>{z.opis}</td><td>{z.waga != null ? kg(z.waga) : ""}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted">Brak wpisów.</p>}

        <h2>Profilaktyka</h2>
        <div className="grid">
          {PROFILAKTYKA.map((t) => {
            const list = [...eventsOf(a.events, t)].reverse();
            const info = dueInfo(a.events, t, today);
            return (
              <div className="box" key={t}>
                <div className="box-h">
                  <span>{EVENT_TYPES[t].label}</span>
                  {info.due && <span className="next">następne: {fmtDate(info.due)}</span>}
                </div>
                {list.length
                  ? <ul>{list.map((e) => <li key={e.id}><b>{fmtDate(e.data)}</b> {e.opis || ""}</li>)}</ul>
                  : <p className="muted small">nie podano</p>}
              </div>
            );
          })}
        </div>

        <h2>Historia wagi</h2>
        {weights.length ? (
          <div className="weights">
            {weights.map((w) => <span key={w.id}><b>{fmtDate(w.data)}</b> {kg(w.waga)}</span>)}
          </div>
        ) : <p className="muted">Brak pomiarów.</p>}

        {showNote && (
          <>
            <h2>Notatka</h2>
            <p className="pre">{a.notatka}</p>
          </>
        )}

        <div className="sign">
          <div className="sign-line" />
          <div className="sign-label">data i podpis</div>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, mono, strong, pre }) {
  return (
    <div className="f">
      <dt>{label}</dt>
      <dd className={[mono && "mono", strong && "strong", pre && "pre"].filter(Boolean).join(" ")}>{value || "—"}</dd>
    </div>
  );
}

function Notice({ text }) {
  return (
    <div style={{ padding: 40, fontFamily: "system-ui, sans-serif", color: "#1c1917" }}>
      <p>{text}</p>
    </div>
  );
}

const css = `
  @page { size: A4 portrait; margin: 13mm; }

  html, body { background: #ebebe8; margin: 0; padding: 0; color: #1c1917; }

  .sheet {
    max-width: 760px; margin: 24px auto 60px; background: #fff; padding: 28px 32px 36px;
    box-shadow: 0 1px 4px rgba(0,0,0,.12);
    font-family: "Segoe UI", system-ui, -apple-system, Arial, sans-serif; font-size: 10pt;
  }

  .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1f2937; padding-bottom: 10px; }
  .org { font-size: 9pt; color: #57534e; }
  h1 { font-family: Georgia, serif; font-size: 18pt; margin: 2px 0 0; text-transform: uppercase; letter-spacing: .5px; }
  .when { font-size: 9pt; color: #57534e; }

  .top { display: flex; gap: 20px; margin-top: 16px; }
  .photo { flex: 0 0 210px; }
  .photo img { width: 210px; height: 170px; object-fit: cover; border-radius: 6px; display: block; }
  .nophoto { width: 210px; height: 170px; border: 1px dashed #d6d3d1; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #a8a29e; font-size: 9pt; }

  .fields { flex: 1; margin: 0; display: grid; gap: 6px; }
  .f { display: grid; grid-template-columns: 130px 1fr; gap: 10px; }
  .f dt { color: #78716c; font-size: 9pt; }
  .f dd { margin: 0; }
  .strong { font-weight: 700; font-size: 12pt; }
  .mono { font-variant-numeric: tabular-nums; letter-spacing: .3px; }
  .pre { white-space: pre-wrap; }

  h2 { font-size: 10.5pt; text-transform: uppercase; letter-spacing: .6px; color: #0f766e; margin: 20px 0 6px; border-bottom: 1px solid #e7e5e4; padding-bottom: 3px; }

  table.t { width: 100%; border-collapse: collapse; font-size: 9pt; }
  table.t th { text-align: left; background: #f0f7f2; padding: 4px 6px; border-bottom: 1px solid #d6d3d1; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  table.t td { padding: 4px 6px; border-bottom: 1px solid #eeeeec; vertical-align: top; }

  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .box { border: 1px solid #e7e5e4; border-radius: 8px; padding: 8px 10px; break-inside: avoid; }
  .box-h { display: flex; justify-content: space-between; gap: 8px; font-weight: 600; font-size: 9pt; margin-bottom: 4px; }
  .next { font-weight: 400; color: #57534e; white-space: nowrap; }
  .box ul { margin: 0; padding-left: 16px; font-size: 9pt; }

  .weights { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 9pt; }
  .muted { color: #a8a29e; }
  .small { font-size: 8.5pt; margin: 0; }

  .sign { margin-top: 40px; width: 240px; margin-left: auto; text-align: center; }
  .sign-line { border-bottom: 0.75pt solid #4b5563; }
  .sign-label { font-size: 8.5pt; color: #444; margin-top: 5px; }

  @media print {
    .no-print { display: none !important; }
    html, body { background: #fff; }
    .sheet { box-shadow: none; margin: 0; padding: 0; max-width: none; }
  }
`;
