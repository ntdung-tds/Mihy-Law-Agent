/* Generate deployable Worker modules from canonical preview assets (no duplicate UI sources). */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(process.argv[2] || path.join(root,'build','r0-preview'));
fs.mkdirSync(out,{recursive:true});
const sources=[
 ['r0_preview_worker.mjs','deployment/cloudflare/src/r0_preview_worker.mjs'],
 ['mobile_assets.mjs','deployment/cloudflare/src/mobile_assets.mjs'],
 ['preview_html.mjs','web/r0-preview/index.html','PREVIEW_HTML'],
 ['preview_css.mjs','web/r0-preview/styles.css','PREVIEW_CSS'],
 ['preview_app.mjs','web/r0-preview/app.js','PREVIEW_JS'],
 ['preview_session.mjs','web/r0-preview/session.js','PREVIEW_SESSION_JS'],
 ['preview_login.mjs','web/r0-preview/login.js','PREVIEW_LOGIN_JS']
];
for(const [name,rel,exportName] of sources){
  const content=fs.readFileSync(path.join(root,rel),'utf8');
  fs.writeFileSync(path.join(out,name),exportName?('export const '+exportName+'='+JSON.stringify(content)+';\n'):content);
}
console.log('Created '+sources.length+' ESM modules in '+out);
