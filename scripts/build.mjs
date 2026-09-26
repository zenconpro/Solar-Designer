// Build สำหรับขึ้นเว็บ: ตรวจความถูกต้อง แล้วรวมเป็นไฟล์เดียว → dist/index.html
//   1) ตรวจไฟล์อัตรา data/rates.js (ตัวเลขต้องอยู่ในช่วงที่สมเหตุสมผล)
//   2) รวม data/rates.js เข้าไปใน index.html (ผลลัพธ์เป็นไฟล์เดียว เปิดได้แม้ไม่มีเน็ต)
//   3) ตรวจไวยากรณ์ JavaScript ทุกส่วน
// ถ้าข้อใดไม่ผ่าน build จะล้ม → Vercel ไม่เปลี่ยนเว็บ (เวอร์ชันเดิมยังใช้งานได้)
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { Script, runInNewContext } from 'node:vm';

const fail = (m) => { console.error('BUILD FAILED: ' + m); process.exit(1); };
let html = readFileSync('index.html', 'utf8');
const ratesSrc = readFileSync('data/rates.js', 'utf8');

if (!/^<!DOCTYPE html>/i.test(html)) fail('index.html must start with <!DOCTYPE html>');
if (/localhost|127\.0\.0\.1|file:\/\//i.test(html + ratesSrc)) fail('found a localhost/file:// reference');

// ── 1) ตรวจ data/rates.js ──
let R;
try { const sb = { window: {} }; runInNewContext(ratesSrc, sb, { filename: 'data/rates.js' }); R = sb.window.HS_RATES; }
catch (e) { fail('data/rates.js อ่านไม่ได้ (ไวยากรณ์ผิด): ' + e.message); }
if (!R) fail('data/rates.js ต้องกำหนด window.HS_RATES');
const num = (v, lo, hi, name) => {
  if (typeof v !== 'number' || !isFinite(v)) fail(`data/rates.js: ${name} = ${JSON.stringify(v)} ต้องเป็นตัวเลข (ไม่ใส่เครื่องหมายคำพูด ไม่มีจุลภาค)`);
  if (v < lo || v > hi) fail(`data/rates.js: ${name} = ${v} ไม่อยู่ในช่วงที่สมเหตุสมผล ${lo}–${hi} — ตรวจการพิมพ์`);
};
if (!/^\d{4}-\d{2}-\d{2}$/.test(R.updated || '')) fail('data/rates.js: updated ต้องเป็น ปปปป-ดด-วว (ค.ศ.)');
if (!R.updatedTH) fail('data/rates.js: ต้องมี updatedTH');
num(R.vatPct, 0, 20, 'vatPct');
num(R.ft, -1, 2, 'ft');
for (const k of ['r12', 'r13', 'b21', 'b22']) {
  const t = R.tariff && R.tariff[k];
  if (!t) fail(`data/rates.js: ไม่มี tariff.${k}`);
  if (!t.label || !t.code || !['res', 'biz'].includes(t.cat)) fail(`data/rates.js: tariff.${k} ต้องมี label, code, cat (res/biz)`);
  num(t.svc, 0, 500, `tariff.${k}.svc`);
  if (t.tou) continue;
  if (!Array.isArray(t.tier) || !t.tier.length) fail(`data/rates.js: tariff.${k}.tier ต้องเป็นรายการขั้นบันได`);
  let lo = 0;
  t.tier.forEach(([hi, r], i) => {
    if (!(hi > lo)) fail(`data/rates.js: tariff.${k}.tier ขั้นที่ ${i + 1} ต้องมากกว่าขั้นก่อนหน้า`);
    num(r, 0.5, 15, `tariff.${k}.tier[${i}] อัตรา`); lo = hi;
  });
  if (lo !== Infinity) fail(`data/rates.js: tariff.${k}.tier ขั้นสุดท้ายต้องเป็น Infinity`);
}
num(R.tou.on, 0.5, 15, 'tou.on'); num(R.tou.off, 0.5, 15, 'tou.off');
num(R.tou.onFrom, 0, 23, 'tou.onFrom'); num(R.tou.onTo, 1, 24, 'tou.onTo'); num(R.tou.weekdays, 200, 262, 'tou.weekdays');
if (R.tou.onTo <= R.tou.onFrom) fail('data/rates.js: tou.onTo ต้องมากกว่า onFrom');
num(R.netBilling.price, 0, 10, 'netBilling.price'); num(R.netBilling.maxKw, 1, 100, 'netBilling.maxKw'); num(R.netBilling.years, 1, 30, 'netBilling.years');
num(R.peaLimitKw[1], 1, 100, 'peaLimitKw[1]'); num(R.peaLimitKw[3], 1, 1000, 'peaLimitKw[3]');
num(R.tax.person.cap, 0, 1e7, 'tax.person.cap'); num(R.tax.person.maxKwp, 0, 1000, 'tax.person.maxKwp'); num(R.tax.corp.extra, 0, 2, 'tax.corp.extra');
num(R.roofWeight.maxKgPerM2, 1, 200, 'roofWeight.maxKgPerM2');
num(R.price.perW, 1, 200, 'price.perW'); num(R.price.battPerKWh, 100, 100000, 'price.battPerKWh');

// ── 2) รวม rates.js เข้าไฟล์เดียว ──
const tag = '<script src="data/rates.js"></script>';
if (html.split(tag).length !== 2) fail('index.html ต้องมี ' + tag + ' หนึ่งครั้ง');
html = html.replace(tag, () => `<script>/* data/rates.js — อัปเดต ${R.updated} */\n${ratesSrc.replace(/<\/script/gi, '<\\/script')}</script>`);

// ── 3) ตรวจไวยากรณ์ JavaScript ทุกส่วน ──
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
if (scripts.length < 2) fail('no inline script found');
scripts.forEach((code, i) => { try { new Script(code, { filename: `inline-script-${i}.js` }); } catch (e) { fail(`script ${i}: ${e.message}`); } });

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
console.log(`build ok → dist/index.html (${(html.length / 1024).toFixed(1)} KB · อัตรา ณ ${R.updatedTH} · ตรวจ ${scripts.length} script)`);
