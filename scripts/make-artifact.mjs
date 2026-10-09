// Turns the single-file build (dist-artifact/index.html) into an Artifact page:
// the Artifact host supplies <!doctype>, <html>, <head>, <body> and the
// charset/viewport metas, so we keep only the title, links, styles, scripts and body content.
// The inlined JS can contain strings like "<body", so we cut at the LAST <body ...> tag.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist-artifact/index.html', 'utf8');
const bodyOpen = html.lastIndexOf('<body');
const bodyStart = html.indexOf('>', bodyOpen) + 1;
const bodyEnd = html.lastIndexOf('</body>');
const headEnd = html.lastIndexOf('</head>', bodyOpen);
const headStart = html.indexOf('<head>') + '<head>'.length;
if (bodyOpen < 0 || bodyEnd < 0 || headEnd < 0) throw new Error('Unexpected build output');

// The single page can't load sibling files, so inline the pre-paint theme script.
const themeInit = readFileSync('public/theme-init.js', 'utf8');

const head = html
  .slice(headStart, headEnd)
  .replace(/<meta charset[^>]*>/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '')
  // the preview link is a single page: no installable-app files
  .replace(/<link rel="(manifest|icon)"[^>]*>/gi, '')
  .replace(/<meta name="apple-mobile-web-app[^>]*>/gi, '')
  .replace(/<script src="[^"]*theme-init\.js"><\/script>/i, () => `<script>\n${themeInit}</script>`);
const body = html.slice(bodyStart, bodyEnd).replace(/<noscript>[\s\S]*?<\/noscript>/i, '');
// Title first so the host finds it in the first 8KB.
const title = head.match(/<title>[^<]*<\/title>/i)?.[0] ?? '<title>Smashboard</title>';
const rest = head.replace(title, '');
writeFileSync('dist-artifact/smashboard.html', `${title}\n${rest.trim()}\n${body.trim()}\n`);
console.log('Wrote dist-artifact/smashboard.html');
