import "server-only";
import { getServiceClient } from "./supabase";

// Validate a login code and return a session payload, or null.
// - The admin code lives in the ADMIN_CODE env var (not in the database).
// - Each gmina's code lives in the `gminas` table and is managed in-app.
export async function validateCode(rawCode) {
  const code = (rawCode || "").trim();
  if (!code) return null;

  const adminCode = process.env.ADMIN_CODE || "";
  if (adminCode && code.toLowerCase() === adminCode.toLowerCase()) {
    return { role: "admin" };
  }

  const supabase = getServiceClient();
  const { data } = await supabase.from("gminas").select("id, name, code");
  const gmina = (data || []).find(
    (g) => (g.code || "").toLowerCase() === code.toLowerCase()
  );
  if (gmina) {
    return { role: "gmina", gminaId: gmina.id, gminaName: gmina.name };
  }
  return null;
}
