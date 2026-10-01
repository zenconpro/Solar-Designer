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
//   ก. ตัวเลขผลลัพธ์ 18 กรณี ต้องตรงกับค่าอ้างอิง (golden.json) ทุกตัวอักษร
//   ข. สูตรแต่ละขั้น (ค่าไฟขั้นบันได, TOU, ผลิตไฟ, คืนทุน ฯลฯ) เทียบกับการคำนวณมือในเอกสาร docs/FORMULAS.md
//   ค. ไม่มี error ในหน้าเว็บ, หน้าไม่ล้นแนวนอน, แถบสรุปด้านขวาไม่ทับเนื้อหา, เลื่อนทีละคอลัมน์ถึงท้าย, กดปุ่มแล้วหน้าไม่ขยับ (จอ 1568×744)
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
  // v2.0: คำนวณจากเครื่องใช้ไฟฟ้าอย่างเดียว · plan = max (ใช้โซลาร์มากที่สุด) | pay (คืนทุนเร็วที่สุด) | custom
  spectra_max:         { tpl: 'spectra' },
  spectra_pay:         { tpl: 'spectra', plan: 'pay' },
  spectra_17_nobatt:   { tpl: 'spectra', plan: 'custom', m3: { n: 17 }, batt: { on: false } },
  spectra_24_batt14:   { tpl: 'spectra', plan: 'custom', m3: { n: 24 }, batt: { on: true, kwh: 14 } },
  spectra_tou:         { tpl: 'spectra', tariff: { type: 'r13' } },
  spectra_net:         { tpl: 'spectra', plan: 'custom', m3: { n: 17 }, batt: { on: false }, tariff: { net: true } },
  spectra_13_pers:     { tpl: 'spectra', plan: 'custom', m3: { n: 13 }, batt: { on: false }, fin: { taxMode: 'person' } },
  spectra_13_corp:     { tpl: 'spectra', plan: 'custom', m3: { n: 13 }, batt: { on: false }, fin: { taxMode: 'corp' } },
  spectra_ev_fixed:    { tpl: 'spectra', plan: 'custom', m3: { n: 17 }, batt: { on: true, kwh: 14 }, ev: { mode: 'fixed' } },
  spectra_ev_custom:   { tpl: 'spectra', ev: { mode: 'custom' } },
  spectra_ev_toumeter: { tpl: 'spectra', ev: { meter: 'tou' } },
  spectra_ac_inv3:     { tpl: 'spectra', ac: { cls: 'inv3', seer: 22, lf: 'tou' } },
  spectra_ac_legacy:   { tpl: 'spectra', ac: { k: 0.095, plf: 'const', c: 0.5 } },
  house:               { tpl: 'house' },
  house_flat:          { tpl: 'house', tariff: { type: 'flat', buy: 4.5 } },
  town:                { tpl: 'townhome' },
  shop:                { tpl: 'shop' },
  office:              { tpl: 'office' },
};
// ช่องที่เก็บค่า (id ของ element ในหน้าเว็บ)
const IDS = ['kKwp', 'kN', 'kInv', 'kInvS', 'kSave', 'kSaveY', 'kPay', 'kCost', 'kGen', 'kGenM', 'roofPill', 'bStats', 'ytbl', 'money', 'battBox',
  'recTxt', 'roofSum', 'wChips', 'invChips', 'm3tot', 'evInfo', 'acHint', 'tHint', 'houseChips', 'sdKpis', 'sdCov', 'sumPlans'];

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
  await pg.waitForTimeout(400); // รอให้แอปบันทึกรอบแรกเสร็จก่อน (ตอนรีเฟรชแอปบันทึกค้างทันที)
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
  await loadCase(pg, { tpl: 'spectra' }, '?debug=1');
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
  await loadCase(pg, { tpl: 'spectra' });
  const sw = () => pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('ค. หน้าเว็บ', `${label} · บ้านและระบบ ไม่ล้นแนวนอน`, (await sw()) <= 0, `ล้น ${await sw()} px`);
  if (w === 1568) {
    const ol = await pg.evaluate(() => { const a = document.querySelector('#home').getBoundingClientRect(), b = document.querySelector('#side').getBoundingClientRect(); return a.right - b.left; });
    check('ค. หน้าเว็บ', `${label} · แถบสรุปด้านขวาไม่ทับเนื้อหา`, ol <= 0, `ทับ ${ol} px`);
    // เลื่อนทีละคอลัมน์ และเลื่อนถึงท้ายคอลัมน์ได้ทุกคอลัมน์ (ทั้ง 3 หน้า)
    const cols = async sel => pg.evaluate(sel => [...document.querySelectorAll(sel)].filter(e => e.offsetWidth).map(e => { const r = e.getBoundingClientRect(), o = getComputedStyle(e).overflowY; return (o === 'auto' || o === 'scroll') && r.bottom <= innerHeight + 1 ? '' : (e.id || e.className) + ' ' + o + ' ล่าง ' + Math.round(r.bottom); }).filter(Boolean), sel);
    check('ค. หน้าเว็บ', `${label} · บ้านและระบบ เลื่อนทีละคอลัมน์ถึงท้าย`, !(await cols('#home .hcol')).length, (await cols('#home .hcol')).join(', '));
    // หน้าคงที่: กดแบต/ขายไฟ/เลือกแบบ แล้วตำแหน่งการ์ดไม่ขยับ
    const pos = () => pg.evaluate(() => [...document.querySelectorAll('#home .card, #side .card, #home [id], #side [id]')].filter(e => e.offsetWidth).map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.height), Math.round(r.left)].join(','); }).join(' '));
    for (const [nm, sel] of [['แบตเตอรี่', 'label.tog:has(#bon)'], ['ขายไฟคืน', 'label.tog:has(#tnet)'], ['เลือกแบบคืนทุนเร็ว', '#sdPlans [data-plan="pay"]']]) {
      await pg.locator(sel).first().scrollIntoViewIfNeeded(); await pg.waitForTimeout(80);
      const a = await pos(); await pg.click(sel); await pg.waitForTimeout(150); const b = await pos();
      check('ค. หน้าเว็บ', `${label} · กด${nm} หน้าไม่ขยับ`, a === b, 'ตำแหน่งเปลี่ยน');
    }
  }
  await pg.click('#tabs button[data-go="in"]');
  await pg.waitForTimeout(80);
  check('ค. หน้าเว็บ', `${label} · เครื่องใช้ไฟฟ้า ไม่ล้นแนวนอน`, (await sw()) <= 0, `ล้น ${await sw()} px`);
  if (w === 1568) {
    const bad = await pg.evaluate(() => [...document.querySelectorAll('#in-load .pane')].map(e => { const r = e.getBoundingClientRect(), o = getComputedStyle(e).overflowY; return (o === 'auto' || o === 'scroll') && r.bottom <= innerHeight + 1 ? '' : 'pane ' + o; }).filter(Boolean));
    check('ค. หน้าเว็บ', `${label} · เครื่องใช้ไฟฟ้า เลื่อนทีละคอลัมน์ถึงท้าย`, !bad.length, bad.join(', '));
    const last = await pg.evaluate(() => { const p = [...document.querySelectorAll('#in-load .pane')].pop(); return p.lastElementChild && p.lastElementChild.dataset.grp; });
    check('ค. หน้าเว็บ', `${label} · รถไฟฟ้าอยู่ท้ายสุด`, last === 'ev', `ท้ายสุดคือ ${last}`);
  }
  await pg.click('#tabs button[data-go="sum"]');
  await pg.waitForTimeout(80);
  check('ค. หน้าเว็บ', `${label} · สรุปผล ไม่ล้นแนวนอน`, (await sw()) <= 0, `ล้น ${await sw()} px`);
  if (w === 1568) {
    const bad = await pg.evaluate(() => [...document.querySelectorAll('.sumcol')].map(e => { const r = e.getBoundingClientRect(), o = getComputedStyle(e).overflowY; return (o === 'auto' || o === 'scroll') && r.bottom <= innerHeight + 1 ? '' : e.id + ' ' + o; }).filter(Boolean));
    check('ค. หน้าเว็บ', `${label} · สรุปผล เลื่อนทีละคอลัมน์ถึงท้าย`, !bad.length, bad.join(', '));
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
