import "server-only";
import { getServiceClient } from "./supabase";

// Kto co widzi — decided here and only here. Page, both print views and
// the exports all walk through this door, so the rules can't drift apart.

export async function loadSettings() {
  try {
    const { data } = await getServiceClient().from("app_state").select("*").eq("id", 1).single();
    return data || {};
  } catch {
    return {}; // brak app_state? fine, defaults it is
  }
}

export const orgName = (settings) => settings?.org_name || process.env.ORG_NAME || "Rejestr schroniska";

// Can this session see adopters' personal data at all?
export function seesAdopters(session, settings) {
  if (!session) return false;
  return session.role === "admin" || !!settings?.gmina_widzi_adoptujacych;
}

// Animals with their events nested as `events`.
// - gmina session: locked to its own gmina, whatever `gminaId` says
// - admin: everything, or one gmina if asked
export async function loadAnimals(session, { gminaId = null, settings = null, id = null } = {}) {
  const supabase = getServiceClient();
  let q = supabase
    .from("animals")
    .select("*, events:animal_events(*)")
    .order("data_przyjecia", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (session.role === "gmina") q = q.eq("gmina_id", session.gminaId);
  else if (gminaId) q = q.eq("gmina_id", gminaId);
  if (id) q = q.eq("id", id);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const showAdopter = seesAdopters(session, settings || (await loadSettings()));
  return (data || []).map((a) => {
    const out = { ...a, events: a.events || [] };
    if (session.role === "gmina") {
      if (!a.notatka_publiczna) out.notatka = null;
      out.events = out.events.map(({ reminded_at, ...e }) => e);
    }
    // removed on the server, not just hidden with CSS. RODO nie żartuje.
    if (!showAdopter) out.adoptujacy = null;
    return out;
  });
}
