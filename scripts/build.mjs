// Build the site into docs/, then tidy docs/assets.
// Old files are kept for the last few builds (someone with the previous page still open can load its pieces),
// and anything older is removed, so the folder doesn't grow with every publish.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const KEEP = 12; // several updates can go out in one afternoon; keep older files around so open pages keep working
const dir = 'docs/assets';
const log = path.join(dir, '.builds.json');
const start = Date.now() - 1000;
execSync('vite build --outDir docs', { stdio: 'inherit' });
const now = fs.readdirSync(dir).filter(f => !f.startsWith('.') && fs.statSync(path.join(dir, f)).mtimeMs >= start);
let builds = [];
try { builds = JSON.parse(fs.readFileSync(log, 'utf8')); } catch { /* first tidy */ }
builds = [now, ...builds].slice(0, KEEP);
const keep = new Set(builds.flat());
let removed = 0;
for (const f of fs.readdirSync(dir)) { if (f.startsWith('.') || keep.has(f)) continue; fs.rmSync(path.join(dir, f)); removed++; }
fs.writeFileSync(log, JSON.stringify(builds));
console.log(`Tidied docs/assets: kept ${keep.size} files from the last ${builds.length} build(s), removed ${removed}.`);
