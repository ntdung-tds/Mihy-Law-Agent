/* R44 responsive visual design, no external assets or tracking. */
export const css = `:root{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#142840;background:#f4f7fb}
*{box-sizing:border-box}body{margin:0;min-height:100vh;min-height:100dvh}
button,input,select{font:inherit}button{cursor:pointer}button:disabled{opacity:.6;cursor:wait}
button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #8bbcff;outline-offset:2px}
header{background:#0d2444;color:#fff;padding:17px max(17px,calc((100vw - 1020px)/2));display:flex;align-items:center;justify-content:space-between;gap:10px}
.brand{display:flex;align-items:center;gap:10px;font-size:22px;font-weight:800;letter-spacing:-.055em}
.brand-icon{display:grid;place-items:center;width:39px;height:39px;border-radius:11px;background:#e6efff;color:#2056a7;font-size:16px}
.env-label{border:1px solid #6682a9;border-radius:22px;padding:7px 11px;font-size:11px;font-weight:700;white-space:nowrap}
main{padding:35px 16px 60px}.login-wrap{max-width:470px;margin:0 auto}
.eyebrow{font-size:11px;color:#2867da;font-weight:800;letter-spacing:.1em;margin:0 0 10px}
h1{font-size:clamp(27px,6vw,37px);letter-spacing:-.055em;line-height:1.15;margin:0 0 12px}
.intro{color:#65768b;font-size:15px;line-height:1.6;margin:0 0 24px}
.panel{background:#fff;border:1px solid #dce5ef;border-radius:20px;padding:26px;box-shadow:0 10px 28px #132f520c}
.panel h2{font-size:19px;letter-spacing:-.025em;margin:0 0 5px}
.hint{font-size:13px;color:#6e8199;margin:0 0 20px;line-height:1.6}
label{display:block;font-size:13px;font-weight:700;margin:17px 0 8px}
input,select{background:#fff;color:#142840;display:block;width:100%;border:1px solid #cbd8e6;border-radius:11px;padding:12px 13px;min-height:50px;font-size:16px}
.password-row{display:flex;gap:7px}.password-row input{flex:1;min-width:0}
.secondary-button{border:1px solid #ceddeb;border-radius:10px;background:#f3f7fc;color:#214a78;padding:10px 13px;font-size:13px;font-weight:750;min-height:44px}
.primary-button{background:#2767e5;color:#fff;border:0;border-radius:11px;padding:12px 16px;font-size:15px;font-weight:760;min-height:50px}
#login-submit{width:100%;margin-top:22px}
.error{background:#fff0f2;color:#a62440;border:1px solid #eac5cd;padding:12px 13px;border-radius:10px;font-size:13px;line-height:1.5;margin:14px 0 0}
.notice{margin-top:21px;border-radius:12px;background:#eff5fc;border:1px solid #d9e8f8;color:#556d88;font-size:12px;line-height:1.65;padding:12px 14px}
.foot{font-size:12px;color:#8293a8;line-height:1.7;margin:21px auto;text-align:center}
.loading{color:#6d7e93;text-align:center;margin:22vh auto}
[hidden]{display:none!important}
.dashboard{max-width:1000px;margin:0 auto}
.dash-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.dash-heading h1{font-size:clamp(25px,5vw,32px)}.muted{font-size:13px;color:#6e8199;line-height:1.6;overflow-wrap:anywhere}
.workspace-panel{margin:22px 0 17px;border:1px solid #dce5ef;border-radius:17px;background:#fff;padding:21px;display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center}
.workspace-panel .muted{margin:0;font-size:11px;font-weight:700;letter-spacing:.05em}
.workspace-name{margin:8px 0;font-size:19px;font-weight:770;letter-spacing:-.02em}
.role{display:inline-block;padding:6px 9px;border-radius:7px;background:#e6f7ef;color:#16694e;font-size:11px;font-weight:750}
.workspace-panel label{margin:0 0 7px}.workspace-panel select{max-width:275px;font-size:14px;min-height:44px}
#switch{margin-top:8px;min-height:42px;padding:8px 13px;width:100%}
.success{padding:15px 17px;background:#edfaf3;border:1px solid #c4e8d4;color:#146447;border-radius:13px;font-size:13px;line-height:1.55}
.section-heading{font-size:18px;letter-spacing:-.03em;margin:24px 0 13px}
.features{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.features article{background:#fff;border:1px solid #dce5ef;border-radius:15px;padding:18px;min-height:130px}
.feature-icon{color:#2867c1;font-size:22px}.features h3{font-size:14px;margin:11px 0 7px}.features p{font-size:12px;color:#778ba0;line-height:1.45;margin:0}
@media(max-width:560px){header{padding:14px 15px}.brand{font-size:20px}.env-label{font-size:10px;padding:6px 8px}main{padding:27px 14px 50px}.panel{padding:22px 20px}.workspace-panel{grid-template-columns:1fr}.workspace-panel select{max-width:none}.features{gap:9px}.features article{padding:14px;min-height:134px}}
@media(max-width:330px){.features{grid-template-columns:1fr}.dash-heading{flex-wrap:wrap}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
`;
export function renderTheme(){
 return new Response(css,{headers:{
  "Content-Type":"text/css; charset=utf-8","Cache-Control":"public, max-age=300",
  "X-Content-Type-Options":"nosniff"
 }});
}
