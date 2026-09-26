// ชุดทดสอบ HONOURTH Solar Rooftop Design
// ------------------------------------------------------------
// ทดสอบ "ไฟล์ที่จะขึ้นเว็บจริง" (dist/index.html) ด้วยเบราว์เซอร์ Chromium
//
// วิธีใช้ (ดูรายละเอียดใน README.md):
//   1) ที่โฟลเดอร์หลัก:  npm run build
//   2) cd tests && npm install && npx playwright install chromium   (ครั้งแรกครั้งเดียว)
//   3) npm test                → ตรวจทั้งหมด
//      npm run update          → บันทึกค่าอ้างอิงใหม่ (ใช้เมื่อ "ตั้งใจ" เปลี่ยนสูตร/อัตรา/ข้อความ แล้วตรวจความถูกต้องแล้ว)
//
// สิ่งที่ตรวจ
//   ก. ตัวเลขผลลัพธ์ 16 กรณี ต้องตรงกับค่าอ้างอิง (golden.json) ทุกตัวอักษร
//   ข. สูตรแต่ละขั้น (ค่าไฟขั้นบันได, TOU, ผลิตไฟ, คืนทุน ฯลฯ) เทียบกับการคำนวณมือในเอกสาร docs/FORMULAS.md
//   ค. ไม่มี error ในหน้าเว็บ, หน้าไม่ล้นแนวนอน, หน้าตั้งค่าไม่ต้องเลื่อน (จอ 1568×744)
// ------------------------------------------------------------
import { chromium } from 'playwright';
import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, '..', 'dist');
const GOLD = join(HERE, 'golden.json');
const UPDATE = process.argv.includes('--update');

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('ไม่พบ dist/index.html — รัน "npm run build" ที่โฟลเดอร์หลักก่อน');
  process.exit(1);
}

// ── เว็บเซิร์ฟเวอร์ชั่วคราว (เสิร์ฟ dist/) ──
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = join(DIST, p);
  if (!f.startsWith(DIST) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL0 = `http://127.0.0.1:${server.address().port}/`;

// ── กรณีทดสอบ (ข้อมูลบ้านบางส่วน ที่เหลือใช้ค่าตั้งต้นของแม่แบบ) ──
const SCEN = {
  spectra_roof:        { tpl: 'spectra', calc: 'roof' },
  spectra_bill:        { tpl: 'spectra', calc: 'bill' },
  spectra_load:        { tpl: 'spectra', calc: 'load' },
  spectra_bill_batt:   { tpl: 'spectra', calc: 'bill', batt: { on: true } },
  spectra_load_batt:   { tpl: 'spectra', calc: 'load', batt: { on: true } },
  spectra_load_tou:    { tpl: 'spectra', calc: 'load', tariff: { type: 'r13' } },
  spectra_bill_net:    { tpl: 'spectra', calc: 'bill', tariff: { net: true } },
  spectra_bill13:      { tpl: 'spectra', calc: 'bill', m2: { n: 13 } },
  spectra_bill13_pers: { tpl: 'spectra', calc: 'bill', m2: { n: 13 }, fin: { taxMode: 'person' } },
  spectra_bill13_corp: { tpl: 'spectra', calc: 'bill', m2: { n: 13 }, fin: { taxMode: 'corp' } },
  spectra_load_evcust: { tpl: 'spectra', calc: 'load', ev: { mode: 'custom' } },
  house_bill:          { tpl: 'house', calc: 'bill' },
  house_flat_bill:     { tpl: 'house', calc: 'bill', tariff: { type: 'flat', buy: 4.5 } },
  town_load:           { tpl: 'townhome', calc: 'load' },
  shop_bill:           { tpl: 'shop', calc: 'bill' },
  office_roof:         { tpl: 'office', calc: 'roof' },
};
// ช่องที่เก็บค่า (id ของ element ในหน้าเว็บ)
const IDS = ['kKwp', 'kN', 'kInv', 'kInvS', 'kSave', 'kSaveY', 'kPay', 'kCost', 'kGen', 'kGenM', 'roofPill', 'bStats', 'ytbl', 'money', 'battBox',
  'recTxt', 'roofSum', 'wChips', 'invChips', 'm2derived', 'm3tot', 'evInfo', 'tHint', 'houseChips'];

const results = []; // {group, name, ok, msg}
const check = (group, name, ok, msg = '') => results.push({ group, name, ok: !!ok, msg });
const errs = [];

const browser = await chromium.launch();
const newPage = async (w = 1568, h = 744) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/fonts|net::/i.test(m.text())) errs.push(m.text()); });
  return pg;
};
const loadCase = async (pg, st, q = '') => {
  await pg.goto(URL0 + q);
  await pg.evaluate(st => { localStorage.clear(); localStorage.setItem('solar-cases-v1', JSON.stringify({ v: 1, active: 't', ids: ['t'], items: { t: Object.assign({ v: 9 }, st) } })); }, st);
  await pg.reload();
  await pg.waitForSelector('#tabs');
};
const grab = pg => pg.evaluate(ids => {
  const o = {};
  for (const id of ids) { const e = document.getElementById(id); if (!e || e.hidden) continue; const t = (e.innerText.trim() ? e.innerText : e.textContent).replace(/[ \u00a0]+/g, ' ').replace(/\s*[\t\n]+\s*/g, ' ¦ ').trim(); if (t) o[id] = t; }
  return o;
}, IDS);

// ── ก. ตัวเลขผลลัพธ์เทียบค่าอ้างอิง ──
const gold = existsSync(GOLD) ? JSON.parse(readFileSync(GOLD, 'utf8')) : {};
const now = {};
{
  const pg = await newPage();
  for (const [name, st] of Object.entries(SCEN)) {
    await loadCase(pg, st);
    await pg.click('#tabs button[data-go="sum"]');
    await pg.waitForTimeout(120);
    now[name] = await grab(pg);
    if (!UPDATE) {
      const g = gold[name];
      if (!g) { check('ก. ผลลัพธ์', name, false, 'ไม่มีค่าอ้างอิง — รัน npm run update'); continue; }
      const diff = [...new Set([...Object.keys(g), ...Object.keys(now[name])])].filter(k => g[k] !== now[name][k]);
      check('ก. ผลลัพธ์', name, !diff.length, diff.map(k => `\n      ${k}\n        เดิม: ${g[k] ?? '(ไม่มี)'}\n        ใหม่: ${now[name][k] ?? '(ไม่มี)'}`).join(''));
    }
  }
  await pg.close();
}
if (UPDATE) { writeFileSync(GOLD, JSON.stringify(now, null, 1) + '\n'); console.log(`บันทึกค่าอ้างอิง ${Object.keys(now).length} กรณี → tests/golden.json`); }

// ── ข. สูตรแต่ละขั้น (เรียกฟังก์ชันจริงของแอปผ่าน ?debug=1) ──
{
  const pg = await newPage();
  await loadCase(pg, { tpl: 'spectra', calc: 'bill' }, '?debug=1');
  const hasDbg = await pg.evaluate(() => !!window.HS_DEBUG);
  check('ข. สูตร', 'เปิดโหมดตรวจสูตร (?debug=1)', hasDbg, 'ไม่พบ window.HS_DEBUG');
  if (hasDbg) {
    const F = await pg.evaluate(() => window.HS_DEBUG.formulaChecks());
    for (const f of F) check('ข. สูตร', f.name, Math.abs(f.app - f.hand) <= (f.tol ?? 0.005), `แอป ${f.app} ≠ มือ ${f.hand}`);
  }
  await pg.close();
}

// ── ค. หน้าเว็บ: error / ล้นจอ ──
for (const [label, w, h] of [['จอ 1568×744', 1568, 744], ['มือถือ 390×844', 390, 844]]) {
  const pg = await newPage(w, h);
  await loadCase(pg, { tpl: 'spectra', calc: 'load' });
  const sw = () => pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('ค. หน้าเว็บ', `${label} · หน้าตั้งค่า ไม่ล้นแนวนอน`, (await sw()) <= 0, `ล้น ${await sw()} px`);
  if (w === 1568) {
    const ov = await pg.evaluate(() => [...document.querySelectorAll('#home .hcol')].map(c => c.scrollHeight - c.clientHeight).filter(v => v > 0));
    check('ค. หน้าเว็บ', `${label} · หน้าตั้งค่า ไม่ต้องเลื่อน (ขั้นสูงซ่อน)`, !ov.length, `คอลัมน์ล้น ${ov.join(',')} px`);
  }
  for (const m of ['roof', 'bill', 'load']) {
    await pg.click('#tabs button[data-go="home"]');
    await pg.click(`#home .mcard[data-go="${m}"]`);
    await pg.waitForTimeout(80);
    check('ค. หน้าเว็บ', `${label} · ข้อมูล${m} ไม่ล้นแนวนอน`, (await sw()) <= 0, `ล้น ${await sw()} px`);
    await pg.click('#tabs button[data-go="sum"]');
    await pg.waitForTimeout(80);
    check('ค. หน้าเว็บ', `${label} · สรุปผล(${m}) ไม่ล้นแนวนอน`, (await sw()) <= 0, `ล้น ${await sw()} px`);
  }
  await pg.close();
}
check('ค. หน้าเว็บ', 'ไม่มี error ใน console', !errs.length, errs.join(' | '));

await browser.close();
server.close();

// ── รายงาน ──
let fail = 0, grp = '';
for (const r of results) {
  if (r.group !== grp) { grp = r.group; console.log('\n' + grp); }
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : '  ' + r.msg}`);
  if (!r.ok) fail++;
}
console.log(`\n${fail ? '✗ ไม่ผ่าน ' + fail : '✓ ผ่านทั้งหมด'} (${results.length - fail}/${results.length})`);
process.exit(fail ? 1 : 0);
