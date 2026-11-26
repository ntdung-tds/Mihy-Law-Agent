/* R47: package public marketing website and protected existing R0 QA workspace into one Worker. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PLATFORM_STYLES} from '../deployment/cloudflare/platform_admin_view_gpt.mjs';
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
 ['account_js.mjs','web/account/app.js','ACCOUNT_JS'],
 ['platform_login_html_gpt.mjs','web/platform/login_gpt.html','PLATFORM_LOGIN_HTML'],
 ['platform_login_js_gpt.mjs','web/platform/login_gpt.mjs','PLATFORM_LOGIN_JS'],
 ['platform_catalog_js_gpt.mjs','web/platform/catalog_gpt.mjs','PLATFORM_CATALOG_JS'],
 ['case_work_html_gpt.mjs','web/case-work/index_gpt.html','CASE_WORK_HTML'],
 ['case_work_js_gpt.mjs','web/case-work/app_gpt.js','CASE_WORK_JS'],
 ['case_metadata_html_gpt.mjs','web/case-detail/index_gpt.html','CASE_METADATA_HTML'],
 ['case_metadata_js_gpt.mjs','web/case-detail/app_gpt.js','CASE_METADATA_JS'],
 ['case_metadata_css_gpt.mjs','web/case-detail/styles_gpt.css','CASE_METADATA_CSS'],
 ['platform_html_gpt.mjs','web/platform/index_gpt.html','PLATFORM_HTML'],
 ['platform_js_gpt.mjs','web/platform/app_gpt.mjs','PLATFORM_JS'],
 ['platform_view_js_gpt.mjs','deployment/cloudflare/platform_admin_view_gpt.mjs','PLATFORM_VIEW_JS'],
 ['platform_client_js_gpt.mjs','deployment/cloudflare/platform_admin_client_gpt.mjs','PLATFORM_CLIENT_JS']
];
for(const [name,src,exported] of modules){
 const text=fs.readFileSync(path.join(root,src),'utf8');
 fs.writeFileSync(path.join(out,name),exported?('export const '+exported+'='+JSON.stringify(text)+';\n'):text);
}
const platformCss='body{margin:0;font:16px system-ui,sans-serif;background:#faf9ff;color:#26233c}.platform-header{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;padding:1rem;background:#26233c;color:white}.platform-header span{font-size:.875rem}main{max-width:1100px;margin:auto;padding:1rem}'+PLATFORM_STYLES;
fs.writeFileSync(path.join(out,'platform_css_gpt.mjs'),'export const PLATFORM_CSS='+JSON.stringify(platformCss)+';\n');
console.log('Mihy Law AI Agent website QA modules prepared: '+modules.length);
