import { adminDb, json, requireDevice, timezone, localParts } from "../lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { ok:false, error:"GET only" });
  if (!requireDevice(req, res)) return;
  const now = new Date();
  const p = localParts(now);
  return json(res, 200, {
    ok: true, epoch: p.epoch, iso: now.toISOString(),
    localDate: p.date, localTime: p.time, timezone: timezone(),
    pollAfterSeconds: 60
  });
}
