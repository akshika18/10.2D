import { adminDb, json, requireDevice } from "../lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok:false, error:"POST only" });
  if (!requireDevice(req, res)) return;
  const { eventId, success, note } = req.body || {};
  if (!eventId) return json(res, 400, { ok:false, error:"Missing eventId" });

  const db = adminDb();
  const { data, error } = await db.from("dose_events")
    .update({
      status: success ? "dispensed" : "failed",
      completed_at: new Date().toISOString(),
      device_note: String(note || (success ? "Servo cycle completed" : "Servo cycle failed")).slice(0,250)
    })
    .eq("id", eventId).eq("status", "authorized")
    .select("id,status").maybeSingle();

  if (error) return json(res, 500, { ok:false, error:"Could not update dispense result" });
  if (!data) return json(res, 409, { ok:false, error:"Event missing or already finalized" });
  return json(res, 200, { ok:true, status:data.status });
}
