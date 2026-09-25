/**
 * Browser verification of the onboarding wizard.
 *
 * Run:  npm run verify:onboarding-ui     (needs a dev server on :3000)
 *
 * Why a browser is required here, and why nothing else caught this: the wizard
 * keeps a learner's answers in `sessionStorage` because each step is a Server
 * Action plus a redirect that **remounts the component**. That interaction cannot
 * be tested from Node — the data layer never sees it, and every server-side
 * verifier passed while the flow was broken.
 *
 * The bug this exists to catch: the write effect persisted the *default* state on
 * remount, before the deferred rehydrate read finished. Storage held
 * `["travel","work"]` immediately after a click and `[]` one step later, so the
 * final submit always reported a missing reason regardless of what was chosen.
 * A single step transition is enough to expose it; this walks all six.
 *
 * Browser discipline, deliberately: one browser, one context, one journey, one
 * port that is never reused, a temporary profile, and a clean shutdown. No
 * navigation loops, no repeated screenshots, no second instance. It also never
 * kills a browser it did not start.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@insforge/sdk";
import { createAuthActions } from "@insforge/sdk/ssr";

const apiUrl = process.env.NEXT_PUBLIC_INSFORGE_URL, anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY, adminKey = process.env.INSFORGE_API_KEY;
const BASE = process.env.BASE_URL ?? "http://localhost:3000", PORT = 9357;
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const dir = mkdtempSync(path.join(tmpdir(), "lm-verify-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const anon = createClient({ baseUrl: apiUrl, anonKey }); const admin = createClient({ baseUrl: apiUrl, anonKey: adminKey });

let pass = 0, fail = 0;
const check = (n, ok, d = "") => { if (ok) pass += 1; else fail += 1; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? `  — ${d}` : ""}`); };

const email = `verify-${Date.now()}@example.com`, pw = "verify-probe-1234";
await anon.auth.signUp({ email, password: pw, name: "Verify" });
const si = await anon.auth.signInWithPassword({ email, password: pw });
const uid = si.data.user.id;
const jar = new Map();
const auth = createAuthActions({ cookies: { get:(n)=>jar.has(n)?{name:n,value:jar.get(n)}:undefined, getAll:()=>[...jar].map(([name,value])=>({name,value})), set:(n,v)=>jar.set(n,v), delete:(n)=>jar.delete(n) }});
await auth.signInWithPassword({ email, password: pw });

const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`, "--no-first-run", "--disable-gpu"], { stdio:["ignore","pipe","pipe"] });
let ws; for (let i=0;i<100;i++){ try{ const r=await fetch(`http://127.0.0.1:${PORT}/json/version`); if(r.ok){ ws=(await r.json()).webSocketDebuggerUrl; break; } } catch { /* not ready yet */ } await sleep(250); }
const sock = new WebSocket(ws); await new Promise((r)=>sock.addEventListener("open",r,{once:true}));
let id=1; const pending=new Map();
sock.addEventListener("message",(e)=>{const p=JSON.parse(String(e.data));const x=pending.get(p.id);if(!x)return;pending.delete(p.id);if(p.error){x.reject(new Error(JSON.stringify(p.error)))}else{x.resolve(p.result)}});
const send=(m,p={},s)=>new Promise((res,rej)=>{const i=id++;pending.set(i,{resolve:res,reject:rej});sock.send(JSON.stringify({id:i,method:m,params:p,...(s?{sessionId:s}:{})}));});
const { targetId } = await send("Target.createTarget",{url:"about:blank"});
const { sessionId } = await send("Target.attachToTarget",{targetId,flatten:true});
await send("Page.enable",{},sessionId); await send("Runtime.enable",{},sessionId); await send("Network.enable",{},sessionId);
await send("Network.setCookie",{name:"insforge_access_token",value:jar.get("insforge_access_token"),domain:"localhost",path:"/"},sessionId);
const ev = async (expr) => { const r = await send("Runtime.evaluate",{expression:`(()=>{${expr}})()`,returnByValue:true,awaitPromise:true},sessionId); if(r.exceptionDetails) return "ERR:"+(r.exceptionDetails.exception?.description??r.exceptionDetails.text); return r.result?.value; };
const url = async () => await ev(`return location.pathname+location.search;`);
const checked = async (n) => await ev(`return [...document.querySelectorAll('input[name=${JSON.stringify(n)}]')].filter(e=>e.checked).map(e=>e.value);`);
/** Tick only what is not already ticked. A blind click UNCHECKS a default. */
const ensureChecked = async (name, values) => {
  await ev(`
    for (const v of ${JSON.stringify(values)}) {
      const box = document.querySelector('input[name="'+${JSON.stringify(name)}+'"][value="'+v+'"]');
      if (box && !box.checked) document.querySelector('label[for="'+${JSON.stringify(name)}+'-'+v+'"]')?.click();
    }
    return true;`);
  await sleep(500);
};
const goBack = async () => {
  await ev(`const f=document.querySelector('form'); [...f.querySelectorAll('button[type=submit]')][0]?.click(); return true;`);
  await sleep(2600);
};
/** Every non-framework field the browser would post. */
const payload = async () =>
  await ev(`const f=document.querySelector('form'); const o={};
    for (const [k,v] of new FormData(f).entries()){ if(k.startsWith('$'))continue; o[k]=o[k]?[].concat(o[k],v):v; }
    return o;`);

const submit = async () => { await ev(`const f=document.querySelector('form'); [...f.querySelectorAll('button[type=submit]')].pop()?.click(); return true;`); await sleep(2800); };
const bodyText = async () => (await ev(`return document.body?document.body.innerText:''`)) ?? "";

await send("Page.navigate",{url:`${BASE}/es/onboarding`},sessionId); await sleep(3500);
check("step 1 renders", (await url()).includes("onboarding"));

// Step 1: pick French — deliberately NOT the language in the URL.
//
// Regression: the hidden `language` field used to carry the URL's language while
// the card set component state, so this exact choice submitted "es" and built the
// plan for the wrong language. Silent, and invisible to every server-side check.
await ev(`document.querySelector('label[for="language-fr"]')?.click(); return true;`); await sleep(600);
const afterLanguage = await payload();
check("step 1 submits the language chosen, not the URL's", afterLanguage.language === "fr",
  `language=${afterLanguage.language}`);
await submit();
// Choosing a different language also moves the route (es -> fr), so wait for the
// navigation this submit caused before asserting on it.
let at2 = await url();
for (let i = 0; i < 12 && !at2.includes("step=2"); i++) { await sleep(700); at2 = await url(); }
check("advanced to step 2", at2.includes("step=2"), at2);
check("step 2 is for the chosen language", at2.includes("/fr/"), at2);

// Step 2: the reported failure — the picker must submit the code
await ev(`document.querySelector('input[role=combobox]')?.focus(); return true;`); await sleep(500);
await submit();
check("step 2 advances with the default first language", (await url()).includes("step=3"), await url());
check("step 2 shows no raw internal error", !/expected string|Too small/.test(await bodyText()));

// Step 3: reasons — the field that was being lost
await ev(`const l=[...document.querySelectorAll('label[for^="motivation-"]')]; l[0]?.click(); l[2]?.click(); return true;`); await sleep(600);
check("reasons selected", (await checked("motivation")).length === 2, JSON.stringify(await checked("motivation")));
await submit();
check("advanced to step 4", (await url()).includes("step=4"), await url());

// Step 4: level + goal
await ev(`document.querySelector('label[for="level-A2"]')?.click(); return true;`); await sleep(300);
await ev(`document.querySelector('label[for="goal-B1"]')?.click(); return true;`); await sleep(300);
await submit();
check("advanced to step 5", (await url()).includes("step=5"), await url());

// Step 5: daily time
await ev(`document.querySelector('label[for="dailyMinutes-20"]')?.click(); return true;`); await sleep(300);
await submit();
check("advanced to step 6", (await url()).includes("step=6"), await url());

// Backward then forward must not erase anything. The wizard remounts on every
// step, so this is the path where answers were silently lost.
await goBack();
check("back reaches step 5", (await url()).includes("step=5"), await url());
await goBack();
check("back reaches step 4", (await url()).includes("step=4"), await url());
await goBack();
check("back reaches step 3 with the reasons intact",
  (await url()).includes("step=3") && (await checked("motivation")).length === 2,
  JSON.stringify(await checked("motivation")));
await submit(); await submit(); await submit();
check("forward again reaches step 6", (await url()).includes("step=6"), await url());

// Listening and Speaking are checked by default; tick without toggling them off.
await ensureChecked("skills", ["listening", "speaking"]);

// THE KEY ASSERTION: the answers survived five step transitions
check("reasons persisted to step 6", (await checked("motivation")).length === 2, JSON.stringify(await checked("motivation")));
check("level persisted to step 6", (await checked("level"))[0] === "A2", JSON.stringify(await checked("level")));
check("daily time persisted to step 6", (await checked("dailyMinutes"))[0] === "20", JSON.stringify(await checked("dailyMinutes")));
check("timezone detected", !!(await ev(`return document.querySelector('input[name=timezone]')?.value;`)), await ev(`return document.querySelector('input[name=timezone]')?.value;`));

// The complete canonical payload the final submit will send.
const finalPayload = await payload();
check("payload carries both reasons", (finalPayload.motivation ?? []).length === 2, JSON.stringify(finalPayload.motivation));
check("payload carries both skills", (finalPayload.skills ?? []).sort().join(",") === "listening,speaking",
  JSON.stringify(finalPayload.skills));
check("payload language is the chosen one", finalPayload.language === "fr", String(finalPayload.language));
check("payload has every required field",
  ["language","nativeLanguage","motivation","level","goal","dailyMinutes","skills"].every((k) => finalPayload[k] !== undefined),
  Object.keys(finalPayload).join(","));

// Name + final submit
await ev(`const el=document.querySelector('input[name=displayName]'); const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(el,'Verify'); el.dispatchEvent(new Event('input',{bubbles:true})); return true;`);
await sleep(400);
// Click the final submit explicitly and poll. The action is much heavier than a
// step transition (draft merge, entitlement, plan write, redirect) and takes
// several seconds, so a fixed sleep is not enough.
await ev(`const f=document.querySelector("form"); const b=[...f.querySelectorAll('button[type=submit]')].pop(); b?.click(); return true;`);
let finalUrl = await url();
for (let i = 0; i < 20 && !finalUrl.includes("/plan"); i++) { await sleep(900); finalUrl = await url(); }
check("final submit reaches the plan summary", finalUrl.includes("/plan"), finalUrl);
// The plan must be for the language that was CHOSEN (fr), not the one in the URL
// the journey started from (es) — the exact confusion this verifier now covers.
check("plan summary names the chosen language", /French/i.test(await bodyText()),
  (await bodyText()).split("\n").find((l) => /plan/i.test(l)) ?? "");
check("plan shows the chosen level in plain language", /basic conversations/i.test(await bodyText()));
check("plan shows the daily target", /20 minutes/.test(await bodyText()));
check("plan shows the chosen reasons", /Travel|School/.test(await bodyText()));
check("no raw internal text anywhere", !/expected string|Too small|at least one reason/.test(await bodyText()));

const { data: saved } = await admin.database.from("learner_languages").select("cefr_level,daily_minutes,motivation,skill_priorities,cefr_goal").eq("user_id", uid).maybeSingle();
check("plan written to the database", Boolean(saved), JSON.stringify(saved));
check("saved level is A2", saved?.cefr_level === "A2", String(saved?.cefr_level));
check("saved daily minutes is 20", saved?.daily_minutes === 20, String(saved?.daily_minutes));
check("saved reasons match the selection", (saved?.motivation ?? []).length === 2, JSON.stringify(saved?.motivation));

chrome.kill("SIGKILL"); await sleep(500); rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:300});
await admin.database.from("profiles").delete().eq("id",uid);
await fetch(`${apiUrl}/api/auth/users`,{method:"DELETE",headers:{"x-api-key":adminKey,"Content-Type":"application/json"},body:JSON.stringify({userIds:[uid]})});
console.log(`\n${pass}/${pass+fail} checks passed`);
