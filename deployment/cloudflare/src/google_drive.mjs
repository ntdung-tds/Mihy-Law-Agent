/** R43 Google Drive file-read provider boundary, QA ONLY.
 * Google Drive access token MUST come from the organization's own approved
 * OAuth grant: a ChatGPT Google Drive connector is not usable as a Worker
 * credential. No OAuth grant, refresh-token handling, upload or sharing yet.
 * This adapter does not replace independent MatterACL checks in the API.
 */
const SAFE_FILE=/^[A-Za-z0-9_-]{10,200}$/;
// Only these provider codes may be surfaced to the QA UI; never copy arbitrary
// Google response bodies, authorization headers or filenames into diagnostics.
const SAFE_REASONS=new Set(['storageQuotaExceeded','insufficientFilePermissions',
 'appNotAuthorizedToFile','rateLimitExceeded','userRateLimitExceeded',
 'dailyLimitExceeded','accessNotConfigured','badRequest','notFound','forbidden']);
export class DriveUploadFailure extends Error{
 constructor(stage,status=0,reason=''){
  super('Google Drive upload '+stage);
  this.name='DriveUploadFailure';
  this.stage=['transport','provider','response','verify'].includes(stage)?stage:'transport';
  this.httpStatus=Number.isInteger(status)&&status>=400&&status<=599?status:0;
  this.reason=SAFE_REASONS.has(reason)?reason:'';
 }
}
async function providerReason(res){
 try{
  const d=await res.clone().json();
  const reason=d?.error?.errors?.[0]?.reason||d?.error?.status||'';
  return SAFE_REASONS.has(reason)?reason:'';
 }catch{return '';}
}
export class GoogleDriveAdapter {
  constructor({accessToken,rootId,fetcher=fetch}){
    if(typeof accessToken!=="string"||accessToken.length<10||
       !SAFE_FILE.test(rootId||"")||typeof fetcher!=="function")
      throw new Error("Unconfigured organization-specific Drive grant");
    this.accessToken=accessToken;this.rootId=rootId;this.fetcher=fetcher;
  }
  async request(url){
    const parsed=new URL(url);
    if(parsed.origin!=="https://www.googleapis.com"||
       !parsed.pathname.startsWith("/drive/v3/files/"))
      throw new Error("Forbidden Drive destination");
    const response=await this.fetcher(url,{
      method:"GET",redirect:"manual",headers:{
        Authorization:"Bearer "+this.accessToken,Accept:"application/json"
      }
    });
    if(!response || response.status!==200)throw new Error("Drive unavailable or denied");
    return response;
  }
  async metadata(objectId){
    if(!SAFE_FILE.test(objectId||""))throw new Error("Bad Drive object ID");
    const params=new URLSearchParams({
      fields:"id,name,mimeType,size,trashed,parents",
      supportsAllDrives:"true",
    });
    const res=await this.request(
      "https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(objectId)+
      "?"+params);
    const data=await res.json();
    if(!data || data.id!==objectId || data.trashed!==false ||
       !Array.isArray(data.parents) || !data.parents.includes(this.rootId) ||
       !data.mimeType || data.mimeType.startsWith("application/vnd.google-apps."))
      throw new Error("Drive file not in approved customer folder");
    return data;
  }
  async download(objectId){
    await this.metadata(objectId); // verify approved folder on every read
    const res=await this.request(
      "https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(objectId)+
      "?alt=media&supportsAllDrives=true");
    if(res.headers?.get("Content-Type")?.includes("text/html"))
      throw new Error("Drive response invalid");
    return res; // streaming body; no publicly shared URL or redirect
  }

  // R72: upload only into the per-organization approved private root.
  // The caller must authorize MatterACL and store a D1 receipt before exposing it.
  async upload({name,mimeType,bytes}){
    if(typeof name!=='string'||!name||name.length>120||
       !/^[\p{L}\p{N}._ -]+$/u.test(name)||name.includes('..')||
       !['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(mimeType)||
       !(bytes instanceof Uint8Array)||bytes.length<22||bytes.length>1500000)
      throw Error('Invalid bounded QA document');
    const boundary='ai_law_'+crypto.randomUUID().replace(/-/g,'');
    const metadata={name,mimeType,parents:[this.rootId]};
    // Match Google's published multipart/related format exactly: metadata
    // first, then media, with CRLF-prefixed delimiters. Do not add legacy
    // Content-Transfer-Encoding or depend on optional create-response fields.
    const body=new Blob([
      '--'+boundary+'\r\n',
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),
      '\r\n--'+boundary+'\r\n',
      'Content-Type: '+mimeType+'\r\n\r\n',
      bytes,
      '\r\n--'+boundary+'--'
    ]);
    const url='https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&'+
      'fields=id,name,mimeType,parents,trashed&supportsAllDrives=true';
    let res;
    try{
      res=await this.fetcher(url,{method:'POST',redirect:'manual',headers:{
        Authorization:'Bearer '+this.accessToken,
        'Content-Type':'multipart/related; boundary='+boundary
      },body});
    }catch{throw new DriveUploadFailure('transport');}
    if(!res||![200,201].includes(res.status))
      throw new DriveUploadFailure('provider',res?.status||0,res?await providerReason(res):'');
    let out;
    try{out=await res.json();}catch{throw new DriveUploadFailure('response');}
    if(!SAFE_FILE.test(out?.id||''))throw new DriveUploadFailure('response');
    // The create response may omit optional parent/name attributes even with
    // a fields mask. The separate files.get is the authoritative folder proof.
    let proof;
    try{proof=await this.metadata(out.id);}
    catch{throw new DriveUploadFailure('verify');}
    if(proof.name!==name||proof.mimeType!==mimeType||
       (proof.size!=null&&Number(proof.size)!==bytes.length))
      throw new DriveUploadFailure('verify');
    return out.id;
  }
  async remove(objectId){
    await this.metadata(objectId);
    const res=await this.fetcher(
      'https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(objectId)+
      '?supportsAllDrives=true',
      {method:'DELETE',redirect:'manual',headers:{Authorization:'Bearer '+this.accessToken}});
    if(!res||res.status!==204)throw Error('Drive cleanup failed');
  }
}
