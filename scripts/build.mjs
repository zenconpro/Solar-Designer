// Production build for a static single-file app: validate, then copy to dist/.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { Script } from 'node:vm';

const html = readFileSync('index.html', 'utf8');
const fail = (m) => { console.error('BUILD FAILED: ' + m); process.exit(1); };

if (!/^<!DOCTYPE html>/i.test(html)) fail('index.html must start with <!DOCTYPE html>');
if (/localhost|127\.0\.0\.1|file:\/\//i.test(html)) fail('found a localhost/file:// reference');

// Syntax-check every inline <script> (catches a broken edit before it ships)
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
if (!scripts.length) fail('no inline script found');
scripts.forEach((code, i) => { try { new Script(code, { filename: `inline-script-${i}.js` }); } catch (e) { fail(`script ${i}: ${e.message}`); } });

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
console.log(`build ok → dist/index.html (${(html.length / 1024).toFixed(1)} KB, ${scripts.length} inline script checked)`);
