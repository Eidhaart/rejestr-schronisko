"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { getServiceClient, PHOTO_BUCKET } from "../lib/supabase";
import { getSession, setSession, clearSession } from "../lib/session";
import { validateCode } from "../lib/auth";
import { EVENT_TYPES, STATUSES, SEX, defaultNext, parseWeight, todayISO } from "../lib/care";

/* ------------------------------ auth ------------------------------ */

export async function login(code) {
  const session = await validateCode(code);
  if (!session) return { error: "Nieprawidłowy kod. Sprawdź i spróbuj ponownie." };
  setSession(session);
  revalidatePath("/");
  return { ok: true };
}

export async function logout() {
  clearSession();
  revalidatePath("/");
  return { ok: true };
}

function requireAdmin() {
  const s = getSession();
  if (!s || s.role !== "admin") throw new Error("Brak uprawnień administratora.");
  return s;
}

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

/* ---------------------------- photos ------------------------------ */

// Full photo + a small thumb (made in the browser) under thumbs/<same path>.
// Table shows the thumb, falls back to the full one if the thumb is missing.
async function uploadPhoto(file, thumbFile) {
  if (!file || typeof file.arrayBuffer !== "function" || file.size === 0) return null;
  const supabase = getServiceClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const path = `${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, buffer, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error("Nie udało się przesłać zdjęcia: " + error.message);

  if (thumbFile && typeof thumbFile.arrayBuffer === "function" && thumbFile.size > 0) {
    try {
      const tbuf = Buffer.from(await thumbFile.arrayBuffer());
      await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(`thumbs/${path}`, tbuf, { contentType: "image/jpeg", upsert: true });
    } catch {
      /* not a big deal, the full image still works */
    }
  }

  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

async function removePhoto(path) {
  if (!path) return;
  try {
    await getServiceClient().storage.from(PHOTO_BUCKET).remove([path, `thumbs/${path}`]);
  } catch {
    /* ignore */
  }
}

/* ---------------------------- animals ----------------------------- */

function readFields(formData) {
  const g = (k) => (formData.get(k) ?? "").toString().trim();
  const status = STATUSES.some((s) => s.id === g("status")) ? g("status") : "schronisko";
  const plec = SEX.some((s) => s.id === g("plec")) ? g("plec") : "nieznana";
  const adopted = status === "adopcja";
  return {
    data_przyjecia: isDate(g("data_przyjecia")) ? g("data_przyjecia") : null,
    gmina_id: g("gmina_id"),
    gmina_name: g("gmina_name"),
    chip: g("chip"),
    opis: g("opis"),
    imie: g("imie"),
    plec,
    status,
    // adoption fields only live while the status says "adopcja" —
    // dog comes back, the old owner's address goes. Inga spöken i databasen.
    data_adopcji: adopted && isDate(g("data_adopcji")) ? g("data_adopcji") : null,
    adoptujacy: adopted ? g("adoptujacy") || null : null,
    notatka: g("notatka") || null,
    notatka_publiczna: formData.get("notatka_publiczna") === "1",
  };
}

function checkFields(f) {
  if (!f.opis) return "Podaj opis zwierzęcia.";
  if (!f.gmina_id) return "Wybierz gminę.";
  return null;
}

export async function createAnimal(formData) {
  requireAdmin();
  const supabase = getServiceClient();
  const fields = readFields(formData);
  const bad = checkFields(fields);
  if (bad) return { error: bad };

  const uploaded = await uploadPhoto(formData.get("photo"), formData.get("photo_thumb"));
  const { data: row, error } = await supabase
    .from("animals")
    .insert({ ...fields, zdjecie: uploaded?.url || null, photo_path: uploaded?.path || null })
    .select("id")
    .single();
  if (error) return { error: error.message };

  // waga przy przyjęciu = first dot on the weight chart
  const waga = parseWeight(formData.get("waga_start"));
  if (waga) {
    await supabase.from("animal_events").insert({
      animal_id: row.id,
      typ: "waga",
      data: fields.data_przyjecia || todayISO(),
      opis: "Waga przy przyjęciu",
      waga,
    });
  }

  revalidatePath("/");
  return { ok: true, id: row.id };
}

export async function updateAnimal(formData) {
  requireAdmin();
  const supabase = getServiceClient();
  const id = (formData.get("id") || "").toString();
  if (!id) return { error: "Brak identyfikatora wpisu." };
  const fields = readFields(formData);
  const bad = checkFields(fields);
  if (bad) return { error: bad };

  const existingPath = (formData.get("existing_photo_path") || "").toString();
  const wantsRemove = formData.get("removePhoto") === "1";
  const uploaded = await uploadPhoto(formData.get("photo"), formData.get("photo_thumb"));

  const patch = { ...fields };
  if (uploaded) {
    patch.zdjecie = uploaded.url;
    patch.photo_path = uploaded.path;
    await removePhoto(existingPath);
  } else if (wantsRemove) {
    patch.zdjecie = null;
    patch.photo_path = null;
    await removePhoto(existingPath);
  }

  const { error } = await supabase.from("animals").update(patch).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/");
  return { ok: true };
}

export async function deleteAnimal(id) {
  requireAdmin();
  const supabase = getServiceClient();
  const { data: row } = await supabase.from("animals").select("photo_path").eq("id", id).single();
  // events go with it (on delete cascade)
  const { error } = await supabase.from("animals").delete().eq("id", id);
  if (error) return { error: error.message };
  if (row?.photo_path) await removePhoto(row.photo_path);
  revalidatePath("/");
  return { ok: true };
}

export async function wipeAllAnimals() {
  requireAdmin();
  const supabase = getServiceClient();
  const { data: rows } = await supabase.from("animals").select("photo_path");
  const paths = (rows || []).map((r) => r.photo_path).filter(Boolean);
  const allPaths = paths.concat(paths.map((p) => `thumbs/${p}`));
  await supabase.from("animals").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (allPaths.length) {
    try { await supabase.storage.from(PHOTO_BUCKET).remove(allPaths); } catch {}
  }
  revalidatePath("/");
  return { ok: true };
}

/* ------------------------- vet history ---------------------------- */

function readEvent(e) {
  const typ = EVENT_TYPES[e?.typ] ? e.typ : null;
  const data = isDate(e?.data) ? e.data : null;
  const nastepny = isDate(e?.nastepny) ? e.nastepny : defaultNext(typ, data);
  return {
    typ,
    data,
    opis: (e?.opis || "").toString().trim() || null,
    waga: parseWeight(e?.waga),
    nastepny: EVENT_TYPES[typ]?.months ? nastepny : null,
  };
}

// payload = JSON { id?, animal_id, typ, data, opis, waga, nastepny }
export async function saveEvent(payload) {
  requireAdmin();
  let raw;
  try { raw = JSON.parse(payload); } catch { return { error: "Nieprawidłowe dane." }; }
  const ev = readEvent(raw);
  if (!ev.typ) return { error: "Wybierz rodzaj wpisu." };
  if (!ev.data) return { error: "Podaj datę." };
  if (ev.typ === "waga" && !ev.waga) return { error: "Podaj wagę w kg." };
  if (ev.typ === "zabieg" && !ev.opis) return { error: "Wpisz, jaki to był zabieg." };

  const supabase = getServiceClient();
  if (raw.id) {
    // changing the date/next date = the old reminder no longer applies
    const { error } = await supabase
      .from("animal_events")
      .update({ ...ev, reminded_at: null })
      .eq("id", raw.id);
    if (error) return { error: error.message };
  } else {
    if (!raw.animal_id) return { error: "Brak zwierzęcia." };
    const { error } = await supabase.from("animal_events").insert({ ...ev, animal_id: raw.animal_id });
    if (error) return { error: error.message };
  }
  revalidatePath("/");
  return { ok: true };
}

// Same thing to many dogs at once — the monthly flea round, 30 psów, one click.
// payload = JSON { animal_ids: [], typ, data, opis }
export async function saveEventBulk(payload) {
  requireAdmin();
  let raw;
  try { raw = JSON.parse(payload); } catch { return { error: "Nieprawidłowe dane." }; }
  const ev = readEvent({ ...raw, waga: null, nastepny: null });
  const ids = Array.isArray(raw.animal_ids) ? raw.animal_ids.filter(Boolean) : [];
  if (!ev.typ || !ev.data) return { error: "Brak rodzaju lub daty." };
  if (!ids.length) return { error: "Zaznacz przynajmniej jedno zwierzę." };

  const { error } = await getServiceClient()
    .from("animal_events")
    .insert(ids.map((animal_id) => ({ ...ev, animal_id })));
  if (error) return { error: error.message };
  revalidatePath("/");
  return { ok: true, count: ids.length };
}

export async function deleteEvent(id) {
  requireAdmin();
  const { error } = await getServiceClient().from("animal_events").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/");
  return { ok: true };
}

/* ----------------------------- gminy ------------------------------ */

export async function saveGminas(payload) {
  requireAdmin();
  const supabase = getServiceClient();
  let list;
  try {
    list = JSON.parse(payload);
  } catch {
    return { error: "Nieprawidłowe dane." };
  }

  const keep = list
    .map((g) => ({
      id: g.id,
      name: (g.name || "").trim(),
      code: (g.code || "").trim().toUpperCase(),
    }))
    .filter((g) => g.name && g.code);

  const { error: upErr } = await supabase.from("gminas").upsert(keep, { onConflict: "id" });
  if (upErr) return { error: upErr.message };

  // gmina renamed? drag the copied name along with it
  for (const g of keep) {
    await supabase.from("animals").update({ gmina_name: g.name }).eq("gmina_id", g.id).neq("gmina_name", g.name);
  }

  const { data: existing } = await supabase.from("gminas").select("id");
  const keepIds = new Set(keep.map((g) => g.id));
  const toDelete = (existing || []).map((g) => g.id).filter((id) => !keepIds.has(id));

  const skipped = [];
  for (const id of toDelete) {
    const { count } = await supabase
      .from("animals")
      .select("id", { count: "exact", head: true })
      .eq("gmina_id", id);
    if (count && count > 0) {
      skipped.push(id);
      continue;
    }
    await supabase.from("gminas").delete().eq("id", id);
  }

  revalidatePath("/");
  return skipped.length
    ? { ok: true, warning: "Niektórych gmin nie usunięto, bo mają przypisane zwierzęta." }
    : { ok: true };
}

/* --------------------------- settings ----------------------------- */

export async function saveSettings(payload) {
  requireAdmin();
  let raw;
  try { raw = JSON.parse(payload); } catch { return { error: "Nieprawidłowe dane." }; }
  const { error } = await getServiceClient()
    .from("app_state")
    .update({
      org_name: (raw.org_name || "").trim() || null,
      gmina_widzi_adoptujacych: !!raw.gmina_widzi_adoptujacych,
    })
    .eq("id", 1);
  if (error) return { error: error.message };
  revalidatePath("/");
  return { ok: true };
}

/* ---------------------------- backups ----------------------------- */

export async function acknowledgeExport() {
  requireAdmin();
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("app_state")
    .update({ last_export_acknowledged_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return { error: error.message };
  revalidatePath("/");
  return { ok: true };
}
