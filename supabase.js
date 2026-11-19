import { createClient } from "@supabase/supabase-js";

export function adminDb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase server environment variables");
  return createClient(url, key, { auth: { persistSession: false } });
}

export function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json").json(body);
}

export function requireDevice(req, res) {
  const expected = process.env.DEVICE_TOKEN;
  const supplied = req.headers["x-device-token"];
  if (!expected || supplied !== expected) {
    json(res, 401, { ok: false, error: "Unauthorized device" });
    return false;
  }
  return true;
}

export function timezone() {
  return process.env.APP_TIMEZONE || "Asia/Kolkata";
}

export function localParts(date = new Date(), tz = timezone()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}:${p.second}`,
    hhmm: `${p.hour}:${p.minute}`,
    epoch: Math.floor(date.getTime() / 1000)
  };
}

export function inWindow(now, start, end) {
  return now >= String(start).slice(0,5) && now <= String(end).slice(0,5);
}
