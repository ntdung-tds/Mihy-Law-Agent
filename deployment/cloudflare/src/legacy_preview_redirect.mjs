/* R47 legacy link bridge only. This Worker is NOT the AI Law product entrypoint.
 * Direct old preview links to the new public site; never proxy auth, cookies or API.
 */
const HOME='https://ai-law-web.iaict-platform.workers.dev';
const allowed=new Set(['/','/index.html','/app','/app/','/login','#documents']);
export function legacyRedirect(request){
 const url=new URL(request.url);
 if(request.method!=='GET'&&request.method!=='HEAD')
  return new Response('The legacy endpoint is retired. Use AI Law Web.',{status:410,headers:{
    'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8',
    'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'
  }});
 if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/v1/'))
  return new Response('Legacy API endpoint retired.',{status:410,headers:{
   'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex,nofollow'
  }});
 const path=url.pathname==='/app'||url.pathname==='/app/'?'/app':
            url.pathname==='/login'?'/login':'/';
 const target=HOME+path;
 return new Response(null,{status:308,headers:{
   'Location':target,'Cache-Control':'no-store','X-Robots-Tag':'noindex,nofollow',
   'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'
 }});
}
export default {fetch:legacyRedirect};
