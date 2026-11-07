/* R47: package public marketing website and protected existing R0 QA workspace into one Worker. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(process.argv[2]||path.join(root,'build','ai-law-web'));
fs.mkdirSync(out,{recursive:true});
const modules=[
 ['site_worker.mjs','deployment/cloudflare/src/site_worker.mjs'],
 ['public_html.mjs','web/website/index.html','SITE_HTML'],
 ['landing_private_html.mjs','web/website/private.html','LANDING_PRIVATE_HTML'],
 ['landing_subscription_html.mjs','web/website/subscription.html','LANDING_SUBSCRIPTION_HTML'],
 ['landing_about_html.mjs','web/website/about.html','LANDING_ABOUT_HTML'],
 ['landing_solutions_html.mjs','web/website/solutions.html','LANDING_SOLUTIONS_HTML'],
 ['landing_features_html.mjs','web/website/features.html','LANDING_FEATURES_HTML'],
 ['landing_security_html.mjs','web/website/security.html','LANDING_SECURITY_HTML'],
 ['footer_contact_html.mjs','web/website/contact.html','FOOTER_CONTACT_HTML'],
 ['public_css.mjs','web/website/styles.css','SITE_CSS'],
 ['public_js.mjs','web/website/site.js','SITE_JS'],
 ['login_html.mjs','web/website/login.html','LOGIN_HTML'],
 ['login_js.mjs','web/website/login.js','LOGIN_JS'],
 ['workspace_html.mjs','web/r0-preview/index.html','WORKSPACE_HTML'],
 ['workspace_css.mjs','web/r0-preview/styles.css','WORKSPACE_CSS'],
 ['workspace_js.mjs','web/r0-preview/app.js','WORKSPACE_JS'],
 ['workspace_session.mjs','web/r0-preview/session.js','WORKSPACE_SESSION'],
 ['workspace_matters.mjs','web/r0-preview/matters.js','WORKSPACE_MATTERS'],
 ['workspace_documents.mjs','web/r0-preview/documents.js','WORKSPACE_DOCUMENTS'],
 ['workspace_legal.mjs','web/r0-preview/legal.js','WORKSPACE_LEGAL'],
 ['drive_blob_html.mjs','web/qa/drive-blob.html','DRIVE_BLOB_HTML'],
 ['drive_blob_js.mjs','web/qa/drive-blob.js','DRIVE_BLOB_JS'],
 ['drive_inline_html.mjs','web/qa/drive-inline.html','DRIVE_INLINE_HTML'],
 ['drive_inline_js.mjs','web/qa/drive-inline.js','DRIVE_INLINE_JS'],
 ['account_html.mjs','web/account/index.html','ACCOUNT_HTML'],
 ['account_css.mjs','web/account/styles.css','ACCOUNT_CSS'],
 ['account_js.mjs','web/account/app.js','ACCOUNT_JS']
];
for(const [name,src,exported] of modules){
 const text=fs.readFileSync(path.join(root,src),'utf8');
 fs.writeFileSync(path.join(out,name),exported?('export const '+exported+'='+JSON.stringify(text)+';\n'):text);
}
console.log('Mihy Law AI Agent website QA modules prepared: '+modules.length);
