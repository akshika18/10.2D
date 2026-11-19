import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
let patients = [];
let events = [];
let currentView = "overview";

function toast(message) {
  const el = $("toast"); el.textContent = message; el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
}
function localDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}
function prettyTime(t) { return String(t || "").slice(0,5); }
function fmtDateTime(v) {
  if (!v) return "—";
  return new Date(v).toLocaleString([], { dateStyle:"medium", timeStyle:"short" });
}
function showView(view) {
  currentView = view;
  ["dashboard","patientsView","historyView","settingsView"].forEach(id => $(id).classList.add("hidden"));
  const map = { overview:"dashboard", patients:"patientsView", history:"historyView", settings:"settingsView" };
  $(map[view]).classList.remove("hidden");
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  $("pageTitle").textContent = ({overview:"Good day.",patients:"Patient details",history:"Dose history",settings:"Care settings"})[view];
}
function doseFor(patientId, slot) {
  return events.find(e => e.patient_id === patientId && e.slot === slot && e.dose_date === localDate());
}
function doseStatus(p, slot) {
  const e = doseFor(p.patient_id, slot);
  if (e?.status === "dispensed") return ["Dispensed","done"];
  if (e?.status === "authorized") return ["Awaiting device confirmation",""];
  if (e?.status === "failed") return ["Dispense failed","overdue"];
  const deadline = prettyTime(slot === "morning" ? p.morning_deadline : p.evening_deadline);
  const now = new Intl.DateTimeFormat("en-GB",{timeZone: $("timezoneInput")?.value || "Asia/Kolkata",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date());
  if (now > deadline) return ["Overdue","overdue"];
  return ["Not yet recorded",""];
}
function renderPatientCard(p, detail=false) {
  const morning = doseStatus(p,"morning"), evening = doseStatus(p,"evening");
  const done = [morning,evening].filter(x=>x[1]==="done").length;
  return `<article class="patient-card" data-patient="${p.patient_id}">
    <div class="patient-head"><div class="patient-title"><div class="patient-avatar">${(p.name||"P").trim().charAt(0).toUpperCase()}</div><div><h3>${escapeHtml(p.name)}</h3><small>${p.patient_id === "patient1" ? "Patient 01" : "Patient 02"} · ${done}/2 completed</small></div></div><span class="status-pill ${done===2?"done":""}">${done===2?"On track":"In progress"}</span></div>
    <div class="dose-rows">
      <div class="dose-row"><div class="dose-label"><span class="dose-dot ${morning[1]}"></span><div><b>Morning medicine</b><small>${prettyTime(p.morning_start)} – ${prettyTime(p.morning_deadline)}</small></div></div><span class="dose-state ${morning[1]}">${morning[0]}</span></div>
      <div class="dose-row"><div class="dose-label"><span class="dose-dot ${evening[1]}"></span><div><b>Evening medicine</b><small>${prettyTime(p.evening_start)} – ${prettyTime(p.evening_deadline)}</small></div></div><span class="dose-state ${evening[1]}">${evening[0]}</span></div>
    </div>${detail?`<p class="muted tiny" style="margin-top:14px">RFID: ${p.rfid_uid ? "Configured" : "Not configured"}</p>`:""}
  </article>`;
}
function escapeHtml(s="") { return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function eventMarkup(e) {
  const p = patients.find(x=>x.patient_id===e.patient_id);
  const label = e.status==="dispensed"?"Dispensed":e.status==="authorized"?"Awaiting confirmation":"Failed";
  return `<div class="event-item"><div class="event-symbol">${e.slot==="morning"?"☼":"☾"}</div><div class="event-copy"><b>${escapeHtml(p?.name||e.patient_id)} · ${e.slot} medicine</b><small>${e.dose_date} · ${fmtDateTime(e.scanned_at)}</small></div><span class="event-status">${label}</span></div>`;
}
async function loadData() {
  const [pRes,eRes] = await Promise.all([
    supabase.from("patients").select("*").order("patient_id"),
    supabase.from("dose_events").select("*").order("scanned_at",{ascending:false}).limit(100)
  ]);
  if (pRes.error || eRes.error) throw new Error(pRes.error?.message || eRes.error?.message);
  patients = pRes.data || []; events = eRes.data || [];
  render();
}
function render() {
  $("patientCards").innerHTML = patients.map(p=>renderPatientCard(p)).join("");
  $("patientDetailCards").innerHTML = patients.map(p=>renderPatientCard(p,true)).join("");
  const todays = events.filter(e=>e.dose_date===localDate());
  $("totalDoses").textContent = patients.length*2;
  $("completedDoses").textContent = todays.filter(e=>e.status==="dispensed").length;
  $("attentionDoses").textContent = todays.filter(e=>e.status==="failed"||e.status==="authorized").length;
  $("recentEvents").innerHTML = events.length ? events.slice(0,5).map(eventMarkup).join("") : `<div class="empty">No dose events recorded yet.</div>`;
  $("historyList").innerHTML = events.length ? events.map(eventMarkup).join("") : `<div class="empty">No dose history yet.</div>`;
  $("lastUpdated").textContent = `Updated ${new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`;
  renderSettings();
}
function renderSettings() {
  $("settingsPatients").innerHTML = patients.map(p=>`
    <div class="patient-setting">
      <h4>${p.patient_id==="patient1"?"Patient 1":"Patient 2"}</h4>
      <div class="fields-grid">
        <label>Patient name<input name="${p.patient_id}.name" value="${escapeHtml(p.name)}" required></label>
        <label>RFID UID<input name="${p.patient_id}.rfid_uid" value="${escapeHtml(p.rfid_uid||"")}" placeholder="e.g. A3 4F 21 9B"></label>
        <label>Morning window starts<input type="time" name="${p.patient_id}.morning_start" value="${prettyTime(p.morning_start)}" required></label>
        <label>Morning deadline<input type="time" name="${p.patient_id}.morning_deadline" value="${prettyTime(p.morning_deadline)}" required></label>
        <label>Evening window starts<input type="time" name="${p.patient_id}.evening_start" value="${prettyTime(p.evening_start)}" required></label>
        <label>Evening deadline<input type="time" name="${p.patient_id}.evening_deadline" value="${prettyTime(p.evening_deadline)}" required></label>
      </div>
    </div>`).join("");
}
$("loginForm").addEventListener("submit", async e=>{
  e.preventDefault(); $("loginError").textContent="";
  const {error}=await supabase.auth.signInWithPassword({email:$("email").value,password:$("password").value});
  if(error) $("loginError").textContent=error.message; else await boot();
});
$("signOut").addEventListener("click", async()=>{await supabase.auth.signOut(); location.reload();});
$("refreshBtn").addEventListener("click", async()=>{try{await loadData();toast("Dashboard refreshed");}catch(e){toast(e.message);}});
document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.go)));
$("settingsForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const fd=new FormData(e.currentTarget);
  for(const p of patients){
    const row={};
    ["name","rfid_uid","morning_start","morning_deadline","evening_start","evening_deadline"].forEach(k=>row[k]=String(fd.get(`${p.patient_id}.${k}`)||"").trim());
    row.rfid_uid=row.rfid_uid.replace(/[\s:]/g,"").toUpperCase() || null;
    if(row.morning_start>=row.morning_deadline || row.evening_start>=row.evening_deadline){$("settingsMessage").textContent="Each start time must be earlier than its deadline.";return;}
    const {error}=await supabase.from("patients").update(row).eq("patient_id",p.patient_id);
    if(error){$("settingsMessage").textContent=error.message;return;}
  }
  $("settingsMessage").textContent="Settings saved.";
  await loadData(); toast("Patient settings saved");
});
document.addEventListener("click",e=>{
  const card=e.target.closest("[data-patient]");
  if(card){showView("patients");}
});
async function boot(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){$("loginPanel").classList.remove("hidden");$("dashboard").classList.add("hidden");return;}
  $("loginPanel").classList.add("hidden");$("dashboard").classList.remove("hidden");
  try{await loadData();showView("overview");}catch(err){toast("Database error: "+err.message);}
}
$("todayLabel").textContent=new Date().toLocaleDateString([], {weekday:"long",month:"long",day:"numeric"}).toUpperCase();
$("timezoneLabel").textContent="Timezone · Asia/Kolkata";
boot();
supabase.auth.onAuthStateChange(()=>boot());
setInterval(()=>{if(currentView==="overview"||currentView==="patients")loadData().catch(()=>{});},30000);
