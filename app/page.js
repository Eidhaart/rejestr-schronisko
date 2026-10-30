import { getSession } from "../lib/session";
import { getServiceClient } from "../lib/supabase";
import { loadAnimals, loadSettings, orgName, seesAdopters } from "../lib/data";
import Login from "../components/Login";
import AppShell from "../components/AppShell";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = getSession();
  if (!session) {
    // login screen still shows the shelter's name if we can get it
    let name = process.env.ORG_NAME || "Rejestr schroniska";
    try { name = orgName(await loadSettings()); } catch {}
    return <Login orgName={name} />;
  }

  try {
    const supabase = getServiceClient();
    const settings = await loadSettings();

    const [animals, { data: gminas, error: gErr }] = await Promise.all([
      loadAnimals(session, { settings }),
      supabase.from("gminas").select("id, name, code").order("name"),
    ]);
    if (gErr) throw new Error(gErr.message);

    // gminas don't need each other's login codes
    const gminasForClient = session.role === "admin"
      ? gminas || []
      : (gminas || []).filter((g) => g.id === session.gminaId).map(({ code, ...g }) => g);

    let exportPending = false;
    if (session.role === "admin") {
      const sent = settings.last_export_sent_at ? new Date(settings.last_export_sent_at).getTime() : 0;
      const ack = settings.last_export_acknowledged_at ? new Date(settings.last_export_acknowledged_at).getTime() : 0;
      exportPending = sent > ack;
    }

    return (
      <AppShell
        session={session}
        orgName={orgName(settings)}
        initialAnimals={animals}
        gminas={gminasForClient}
        canSeeAdopters={seesAdopters(session, settings)}
        settings={session.role === "admin" ? {
          org_name: settings.org_name || "",
          gmina_widzi_adoptujacych: !!settings.gmina_widzi_adoptujacych,
        } : null}
        exportPending={exportPending}
        lastExportSentAt={session.role === "admin" ? settings.last_export_sent_at || null : null}
      />
    );
  } catch (e) {
    return <SetupError message={e?.message || String(e)} />;
  }
}

/* Shows the real reason instead of Next's useless "Application error" page. */
function SetupError({ message }) {
  const m = (message || "").toLowerCase();
  let hint = "Sprawdź logi serwera (Vercel → Logs), aby poznać szczegóły.";
  if (/brak konfiguracji|supabase_url|service_role/.test(m)) {
    hint =
      "Zmienne SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY nie docierają do aplikacji. " +
      "Sprawdź je w Vercel → Settings → Environment Variables (zakres Production) i wykonaj ponowny deploy bez cache.";
  } else if (/animal_events|app_state|does not exist|relation|schema cache|could not find/.test(m)) {
    hint = "Brakuje tabeli w bazie. Uruchom w Supabase → SQL Editor plik supabase/schema.sql.";
  }

  return (
    <div className="min-h-screen grid place-items-center px-6 bg-stone-100 dark:bg-stone-950 text-stone-900 dark:text-stone-100">
      <div className="w-full max-w-md rounded-2xl border border-red-200 dark:border-red-900 bg-white dark:bg-stone-900 p-6">
        <h1 className="text-lg font-semibold">Coś jest nie tak z konfiguracją</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Aplikacja nie mogła się uruchomić. Poniżej rzeczywisty powód:
        </p>
        <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-stone-100 dark:bg-stone-800 p-3 text-xs text-red-600 dark:text-red-300">
          {message}
        </pre>
        <p className="mt-4 text-sm">{hint}</p>
      </div>
    </div>
  );
}
