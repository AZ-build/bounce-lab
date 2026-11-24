// Builds games/smashball/index.html: bundles three.js + main.js into one inline script.
import { build } from 'esbuild';
import fs from 'fs';
const out = await build({ entryPoints: ['main.js'], bundle: true, minify: true, format: 'iife', write: false, legalComments: 'eof', target: 'es2020' });
let js = out.outputFiles[0].text;
if (js.includes('</script')) js = js.replace(/<\/script/g, '<\\/script');
const tpl = fs.readFileSync('template.html', 'utf8');
const lab = process.argv[2] === 'lab'
  ? '<script src="../../lab/lab.js?v=1.11" data-game="smashball" data-version="v4" data-menus="own"></script>'
  : '';
const html = tpl.replace('<!--LAB-->', lab).replace('/*GAME*/', () => js);
const dest = process.argv[3] || 'dist/index.html';
fs.mkdirSync(dest.replace(/\/[^/]+$/, ''), { recursive: true });
fs.writeFileSync(dest, html);
console.log('wrote', dest, (html.length / 1024).toFixed(0) + ' KB');
