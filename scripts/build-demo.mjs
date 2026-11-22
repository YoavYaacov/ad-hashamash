// Builds the interactive demo (in-memory server) into ONE self-contained HTML file: demo-dist/index.html
import { build } from 'esbuild';
import fs from 'node:fs';
const out = 'demo-dist';
fs.rmSync(out, { recursive: true, force: true });
await build({
  entryPoints: ['src/demo/main.tsx'], bundle: true, minify: true, format: 'iife', target: 'es2020',
  jsx: 'automatic', charset: 'utf8', outdir: out, logLevel: 'warning',
  define: {
    'import.meta.env.BASE_URL': '"/"',
    'import.meta.env.VITE_SUPABASE_URL': 'undefined',
    'import.meta.env.VITE_SUPABASE_ANON_KEY': 'undefined',
  },
});
const js = fs.readFileSync(`${out}/main.js`, 'utf8').replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(`${out}/main.css`, 'utf8');
const html = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>עד השמש · הדגמה</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;700;800&family=Heebo:wght@400;700;900&family=Rubik:wght@400;600;800&family=Secular+One&display=swap" rel="stylesheet">
<style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
fs.writeFileSync(`${out}/index.html`, html);
fs.rmSync(`${out}/main.js`); fs.rmSync(`${out}/main.css`);
console.log('demo-dist/index.html', (html.length / 1024).toFixed(0), 'KB');
