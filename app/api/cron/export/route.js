import { NextResponse } from "next/server";
import { getServiceClient } from "../../../../lib/supabase";
import { loadAnimals, loadSettings, orgName } from "../../../../lib/data";
import { sendBackupEmail, sendReminderEmail } from "../../../../lib/email";
import { collectReminders } from "../../../../lib/care";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

// Runs once a day (vercel.json). Two jobs, independent of each other:
//  1. backup email, if 5+ days since the last one
//  2. reminder email for prophylaxis that's due — sparingly, so nobody
//     wakes up to the same flea reminder fourteen mornings in a row
export async function GET(request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = new URL(request.url).searchParams.get("force") === "1";
  const supabase = getServiceClient();
  const settings = await loadSettings();
  const org = orgName(settings);
  const out = {};

  let animals;
  try {
    animals = await loadAnimals({ role: "admin" }, { settings });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  // 1 — backup
  const last = settings.last_export_sent_at ? new Date(settings.last_export_sent_at).getTime() : 0;
  if (force || Date.now() - last >= FIVE_DAYS_MS) {
    try {
      await sendBackupEmail(animals, org);
      await supabase.from("app_state").update({ last_export_sent_at: new Date().toISOString() }).eq("id", 1);
      out.backup = { sent: true, count: animals.length };
    } catch (e) {
      out.backup = { sent: false, error: e.message };
    }
  } else {
    out.backup = { sent: false, reason: "not due yet" };
  }

  // 2 — reminders. reminded_at sits on the *last* dose's row; a new dose is
  // a new row with reminded_at = null, so the cycle starts over by itself.
  // Twice at most: once when it gets close, once more if it slips past the date.
  const fresh = collectReminders(animals).filter((r) =>
    !r.last.reminded_at ||
    (r.state === "overdue" && r.last.reminded_at.slice(0, 10) < r.due)
  );
  if (fresh.length) {
    try {
      const appUrl = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
      await sendReminderEmail(fresh, org, appUrl);
      await supabase
        .from("animal_events")
        .update({ reminded_at: new Date().toISOString() })
        .in("id", fresh.map((r) => r.last.id));
      out.reminders = { sent: true, count: fresh.length };
    } catch (e) {
      out.reminders = { sent: false, error: e.message };
    }
  } else {
    out.reminders = { sent: false, reason: "nothing new due" };
  }

  const failed = out.backup.error || out.reminders.error;
  return NextResponse.json(out, { status: failed ? 500 : 200 });
}
