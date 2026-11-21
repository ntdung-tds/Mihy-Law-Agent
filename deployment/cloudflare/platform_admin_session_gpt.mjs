// R223: Worker integration boundary. Mount only with trusted session/CSRF resolvers.
import {handlePlatformAdminRequest} from './platform_admin_http_gpt.mjs';
const PREFIX='/api/platform/';
const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
function reject(status,error){return new Response(JSON.stringify({error}),{status,headers:HEADERS});}
// resolveSession verifies server-side session; verifyCsrf binds token to session/origin.
// NEVER derive privilege from browser-supplied role, principal, tenant, or headers.
export async function dispatchPlatformAdmin(request,{db,resolveSession,verifyCsrf,newAuditId}={}){
 if(!(request instanceof Request)) return reject(400,'BAD_REQUEST');
 const url=new URL(request.url);
 if(!url.pathname.startsWith(PREFIX)) return null;
 if(typeof resolveSession!=='function'||typeof verifyCsrf!=='function'||typeof newAuditId!=='function')
   return reject(503,'PLATFORM_NOT_CONFIGURED');
 if(!db||typeof db.prepare!=='function'||typeof db.batch!=='function') return reject(503,'SERVICE_UNAVAILABLE');
 try{
   const session=await resolveSession(request);
   if(!session||session.verified!==true||session.kind!=='system_admin'||
      typeof session.id!=='string'||!SAFE_ID.test(session.id)||session.impersonating===true)
     return reject(403,'FORBIDDEN');
   const principal=Object.freeze({id:session.id,kind:'system_admin',verified:true,impersonating:false});
   let csrfVerified=false;
   if(request.method!=='GET'){
     csrfVerified=(await verifyCsrf(request,session))===true;
     if(!csrfVerified) return reject(403,'CSRF_FORBIDDEN');
   }
   return await handlePlatformAdminRequest(request,{db,principal,csrfVerified,newAuditId});
 }catch{return reject(503,'SERVICE_UNAVAILABLE');}
}
