import crypto from "crypto";
import { cookies } from "next/headers";

const COOKIE = "hycel_session";
const SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 dni, then log in again

function sign(data) {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verify(token) {
  if (!token || typeof token !== "string") return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

// Read the current session ({ role, gminaId?, gminaName? }) or null.
export function getSession() {
  const token = cookies().get(COOKIE)?.value;
  return verify(token);
}

// Set the session cookie. Call only inside a Server Action or Route Handler.
export function setSession(data) {
  cookies().set(COOKIE, sign({ ...data, exp: Date.now() + MAX_AGE * 1000 }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function clearSession() {
  cookies().delete(COOKIE);
}
