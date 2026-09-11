import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const distDir = resolve(root, 'dist');
const indexPath = resolve(distDir, 'index.html');
const configTemplatePath = resolve(root, 'platforms', 'tizen', 'config.xml.template');
const configPath = resolve(distDir, 'config.xml');

let html = await readFile(indexPath, 'utf8');

// Samsung Product API: necessário para ler DUID/modelo da TV e registrar
// automaticamente a instalação no painel administrativo.
if (!html.includes('$WEBAPIS/webapis/webapis.js')) {
  html = html.replace(/<head>/i, '<head>\n<script type="text/javascript" src="$WEBAPIS/webapis/webapis.js"></script>');
}

// Samsung Tizen 6.0 packaged apps run from file://. Keep only Vite's
// SystemJS/legacy entry, because ES module scripts can be rejected by the TV
// even when the JavaScript engine supports much of the modern syntax.
html = html.replace(/<script\b[^>]*\btype=["']module["'][^>]*>[\s\S]*?<\/script>\s*/gi, '');
html = html.replace(/<link\b[^>]*\brel=["']modulepreload["'][^>]*>\s*/gi, '');
html = html.replace(/\snomodule(?=[\s>])/gi, '');

// A visible crash screen is much more useful than a black TV screen. This
// catches runtime/parser errors after the HTML itself has loaded.
const diagnostics = `<script>
(function(){
  function esc(v){return String(v==null?'':v).replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c;});}
  function show(title,detail){
    var root=document.getElementById('root');
    if(!root)return;
    root.innerHTML='<main style="min-height:100vh;background:#070b09;color:#fff;display:flex;align-items:center;justify-content:center;padding:48px;box-sizing:border-box;font-family:Arial,sans-serif;text-align:center"><div style="max-width:1100px"><div style="font-size:46px;font-weight:800;color:#bef264;margin-bottom:18px">Top TV Digital</div><div style="font-size:28px;font-weight:700;margin-bottom:14px">'+esc(title)+'</div><div style="font-size:18px;line-height:1.5;color:#cbd5e1;word-break:break-word">'+esc(detail)+'</div></div></main>';
  }
  window.addEventListener('error',function(e){show('Erro ao iniciar na TV',(e.message||'Erro JavaScript')+(e.filename?' — '+e.filename+':'+e.lineno:''));});
  window.addEventListener('unhandledrejection',function(e){var r=e.reason;show('Erro ao iniciar na TV',r&&r.message?r.message:String(r||'Promise rejeitada'));});
})();
</script>`;
html = html.replace(/<head>/i, `<head>\n${diagnostics}`);

const moduleScriptTag = /<script\b[^>]*\btype=["']module["'][^>]*>/i;
const noModuleAttr = /<script\b[^>]*\bnomodule\b[^>]*>/i;
const legacyEntry = /id=["']vite-legacy-entry["']/i;
const legacyPolyfill = /id=["']vite-legacy-polyfill["']/i;

if (moduleScriptTag.test(html)) throw new Error('Tizen preparation failed: an actual module <script> tag still exists.');
if (noModuleAttr.test(html)) throw new Error('Tizen preparation failed: a nomodule attribute still exists.');
if (!legacyEntry.test(html)) throw new Error('Tizen preparation failed: Vite legacy entry was not generated.');
if (!legacyPolyfill.test(html)) throw new Error('Tizen preparation failed: Vite legacy polyfill was not generated.');
if (!/\.\/assets\//i.test(html)) throw new Error('Tizen preparation failed: relative ./assets/ paths were not generated.');

await writeFile(indexPath, html, 'utf8');
await copyFile(configTemplatePath, configPath);

console.log('Tizen build prepared successfully: legacy-only HTML + classic worker + Samsung ProductInfo + diagnostics + relative assets + config.xml.');
