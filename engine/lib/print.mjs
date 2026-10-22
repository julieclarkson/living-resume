// PDF and DOCX without packages: the browser already on the machine prints the
// PDF; macOS's built-in textutil (or pandoc, if installed) writes the DOCX.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

export function findChrome() {
  const env = process.env.CHROME_PATH;
  const candidates = [
    env,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  // Playwright's bundled Chromium (CI, cloud workspaces)
  for (const base of ['/opt/pw-browsers', path.join(os.homedir(), '.cache/ms-playwright')]) {
    if (!fs.existsSync(base)) continue;
    for (const d of fs.readdirSync(base)) {
      const c = path.join(base, d, 'chrome-linux', 'chrome');
      if (/^chromium-\d+$/.test(d) && fs.existsSync(c)) return c;
    }
  }
  return null;
}

export function htmlToPdf(htmlPath, pdfPath) {
  const chrome = findChrome();
  if (!chrome) throw new Error('No Chrome/Chromium found. Install Google Chrome, or set CHROME_PATH.');
  const args = ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-pdf-header-footer', '--run-all-compositor-stages-before-draw', '--virtual-time-budget=8000', `--print-to-pdf=${pdfPath}`, `file://${path.resolve(htmlPath)}`];
  execFileSync(chrome, args, { stdio: 'pipe', timeout: 90_000 });
  if (!fs.existsSync(pdfPath)) throw new Error('Chrome did not write the PDF.');
  return pdfPath;
}

export function htmlToDocx(htmlPath, docxPath) {
  const tryRun = (cmd, args) => { try { execFileSync(cmd, args, { stdio: 'pipe', timeout: 60_000 }); return fs.existsSync(docxPath); } catch { return false; } };
  if (process.platform === 'darwin' && tryRun('/usr/bin/textutil', ['-convert', 'docx', '-output', docxPath, htmlPath])) return 'textutil';
  if (tryRun('pandoc', [htmlPath, '-o', docxPath])) return 'pandoc';
  return null;
}

// Page count without a PDF library: count page objects.
export function pdfPageCount(pdfPath) {
  const s = fs.readFileSync(pdfPath).toString('latin1');
  return (s.match(/\/Type\s*\/Page(?!s)/g) || []).length;
}

// Text extraction as screening software sees it (needs poppler's pdftotext).
export function pdfText(pdfPath) {
  try { return execFileSync('pdftotext', [pdfPath, '-'], { stdio: 'pipe' }).toString('utf8'); } catch { return null; }
}
