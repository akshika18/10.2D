import { adminDb, json, requireDevice, timezone, localParts, inWindow } from "../lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok:false, error:"POST only" });
  if (!requireDevice(req, res)) return;

  const uid = String(req.body?.uid || "").replaceAll(":", "").replaceAll(" ", "").toUpperCase();
  if (!uid) return json(res, 400, { ok:false, error:"Missing RFID UID" });

  const db = adminDb();
  const { data: patients, error } = await db.from("patients").select("*").eq("enabled", true);
  if (error) return json(res, 500, { ok:false, error:"Database read failed" });

  const patient = (patients || []).find(p =>
    String(p.rfid_uid || "").replaceAll(":", "").replaceAll(" ", "").toUpperCase() === uid
  );
  if (!patient) return json(res, 200, { ok:true, authorized:false, reason:"unknown_card", message:"Card not registered" });

  const now = new Date();
  const local = localParts(now);
  const t = local.hhmm;
  let slot = null;
  if (inWindow(t, patient.morning_start, patient.morning_deadline)) slot = "morning";
  else if (inWindow(t, patient.evening_start, patient.evening_deadline)) slot = "evening";
  else {
    let reason = "outside_dose_window";
    if (t > String(patient.morning_deadline).slice(0,5) &&
        t < String(patient.evening_start).slice(0,5)) reason = "morning_deadline_passed";
    else if (t > String(patient.evening_deadline).slice(0,5)) reason = "evening_deadline_passed";
    return json(res, 200, {
      ok:true, authorized:false, reason, patientId:patient.patient_id,
      patientName:patient.name, localTime:local.time, timezone:timezone(),
      message:"Outside the permitted dose window. No medicine dispensed."
    });
  }

  const { data: existing } = await db.from("dose_events")
    .select("id,status").eq("patient_id", patient.patient_id)
    .eq("slot", slot).eq("dose_date", local.date).maybeSingle();

  if (existing) return json(res, 200, {
    ok:true, authorized:false, reason:"already_recorded", patientId:patient.patient_id,
    patientName:patient.name, slot, message:"This dose already has a recorded event."
  });

  const { data: event, error: insertError } = await db.from("dose_events").insert({
    patient_id: patient.patient_id, slot, dose_date: local.date, status:"authorized",
    scanned_at: now.toISOString(), device_note:"RFID scan authorized by server"
  }).select("id").single();

  if (insertError) {
    
    return json(res, 200, { ok:true, authorized:false, reason:"already_recorded", patientId:patient.patient_id, patientName:patient.name, slot });
  }

  const servo = {
    morning: patient.patient_id === "patient1" ? 1 : 3,
    evening: patient.patient_id === "patient1" ? 2 : 4
  }[slot];

  return json(res, 200, {
    ok:true, authorized:true, eventId:event.id, patientId:patient.patient_id,
    patientName:patient.name, slot, servo, durationMs:10000,
    localTime:local.time, timezone:timezone(),
    message:`Dispensing ${slot} medicine`
  });
}
