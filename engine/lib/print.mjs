// PDF and DOCX without packages: the browser already on the machine prints the
// PDF; macOS's built-in textutil (or pandoc, if installed) writes the DOCX.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function findChrome() {
  if (process.env.LIVING_RESUME_NO_CHROME) return null;
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
  const args = ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-pdf-header-footer', '--run-all-compositor-stages-before-draw', '--virtual-time-budget=8000', `--print-to-pdf=${pdfPath}`, pathToFileURL(path.resolve(htmlPath)).href];
  execFileSync(chrome, args, { stdio: 'pipe', timeout: 90_000 });
  if (!fs.existsSync(pdfPath)) throw new Error('Chrome did not write the PDF.');
  return pdfPath;
}

// The résumé PDF: Chrome when it's available (exact design), otherwise the Python fallback
// (engine/pdf/fallback.py, reportlab), which Claude Cowork and ChatGPT workspaces can run.
// Returns 'chrome' or 'fallback'; throws with a plain explanation when neither works.
export function renderPdf(model, htmlPath, pdfPath) {
  if (findChrome()) { htmlToPdf(htmlPath, pdfPath); return 'chrome'; }
  const script = new URL('../pdf/fallback.py', import.meta.url).pathname;
  for (const py of ['python3', 'python']) {
    try {
      execFileSync(py, [script, pdfPath], { input: JSON.stringify(model), stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 });
      if (fs.existsSync(pdfPath)) return 'fallback';
    } catch (e) {
      if (/No module named .?reportlab/.test(String(e.stderr || ''))) throw new Error('No Chrome found, and the PDF fallback needs reportlab: pip install reportlab (or install Google Chrome).');
    }
  }
  throw new Error('No Chrome or Python found to make the PDF. Install Google Chrome, or Python 3 with reportlab.');
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
