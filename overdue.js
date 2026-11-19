import { adminDb, json, localParts, timezone } from "../lib/supabase.js";

export default async function handler(req, res) {
  const auth = req.headers.authorization || "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return json(res, 401, { ok:false, error:"Unauthorized cron request" });
  }

  const db = adminDb();
  const now = new Date();
  const local = localParts(now);
  const { data: patients, error } = await db.from("patients").select("*").eq("enabled", true);
  if (error) return json(res, 500, { ok:false, error:"Could not load patients" });

  const alerts = [];
  for (const p of patients || []) {
    for (const slot of ["morning","evening"]) {
      const deadline = slot === "morning" ? String(p.morning_deadline).slice(0,5) : String(p.evening_deadline).slice(0,5);
      if (local.hhmm <= deadline) continue;

      const { data: event } = await db.from("dose_events").select("id,status")
        .eq("patient_id", p.patient_id).eq("slot", slot).eq("dose_date", local.date).maybeSingle();
      if (event?.status === "dispensed") continue;

      const { data: existing } = await db.from("overdue_notifications").select("id")
        .eq("patient_id", p.patient_id).eq("slot", slot).eq("dose_date", local.date).maybeSingle();
      if (existing) continue;

      const { data: marker, error: markError } = await db.from("overdue_notifications")
        .insert({ patient_id:p.patient_id, slot, dose_date:local.date }).select("id").single();
      if (markError || !marker) continue;

      const topic = process.env.NTFY_TOPIC;
      if (!topic) continue;
      const message = `${p.name} has not completed the ${slot} medicine record by ${deadline} (${local.date}, ${timezone()}). Please check in.`;
      const response = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
        method:"POST",
        headers:{
          "Title":`Medicine overdue: ${p.name}`,
          "Priority":"high",
          "Tags":"pill,warning",
          "Content-Type":"text/plain"
        },
        body:message
      });
      if (!response.ok) {
        
        await db.from("overdue_notifications").delete().eq("id", marker.id);
        alerts.push({ patient:p.patient_id, slot, sent:false });
      } else {
        alerts.push({ patient:p.patient_id, slot, sent:true });
      }
    }
  }
  return json(res, 200, { ok:true, checkedAt:now.toISOString(), alerts });
}
