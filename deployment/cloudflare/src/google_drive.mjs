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
    this.accessToken=accessToken;this.rootId=rootId;
    // Cloudflare Workers fetch() requires its global receiver. Storing it as
    // this.fetcher and invoking the property directly throws 'Illegal invocation'.
    // Call the captured function as a bare function through an arrow wrapper.
    this.fetcher=(url,init)=>fetcher(url,init);
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
  async metadata(objectId,approvedParent=this.rootId){
    if(!SAFE_FILE.test(objectId||""))throw new Error("Bad Drive object ID");
    const params=new URLSearchParams({
      fields:"id,name,mimeType,size,trashed,parents,appProperties,createdTime",
      supportsAllDrives:"true",
    });
    const res=await this.request(
      "https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(objectId)+
      "?"+params);
    const data=await res.json();
    if(!data || data.id!==objectId || data.trashed!==false ||
       !Array.isArray(data.parents) || !data.parents.includes(approvedParent) ||
       !data.mimeType || data.mimeType.startsWith("application/vnd.google-apps."))
      throw new Error("Drive file not in approved customer folder");
    return data;
  }
  async childFolder(folderId){
    if(!SAFE_FILE.test(folderId||'')||folderId===this.rootId)
      throw new Error('Invalid child folder');
    const response=await this.request('https://www.googleapis.com/drive/v3/files/'+
      encodeURIComponent(folderId)+'?fields=id,name,mimeType,trashed,parents&supportsAllDrives=true');
    const info=await response.json();
    if(info.id!==folderId||info.trashed!==false||
       info.mimeType!=='application/vnd.google-apps.folder'||
       !Array.isArray(info.parents)||!info.parents.includes(this.rootId))
      throw new Error('Folder is not an approved child of the tenant root');
    return info;
  }
  // The actual My Drive root is distinct from AI Law's historic private root.
  // Never fall back to this location unless Save explicitly chose My Drive.
  async accountRoot(){
    const response=await this.request('https://www.googleapis.com/drive/v3/files/root?'+
      'fields=id,mimeType,trashed,capabilities(canAddChildren)&supportsAllDrives=true');
    const info=await response.json();
    if(!SAFE_FILE.test(info?.id||'')||info.mimeType!=='application/vnd.google-apps.folder'||
       info.trashed!==false||info.capabilities?.canAddChildren!==true)
      throw Error('My Drive root is not writable');
    return info.id;
  }
  // Google Picker explicitly authorizes this folder for the connected OAuth app.
  // The provider, not a user-supplied folder name, must confirm write access.
  async writableFolder(id){
    if(!SAFE_FILE.test(id||''))throw Error('Invalid Drive folder');
    const response=await this.request('https://www.googleapis.com/drive/v3/files/'+
      encodeURIComponent(id)+'?fields=id,name,mimeType,trashed,capabilities(canAddChildren)&supportsAllDrives=true');
    const info=await response.json();
    if(info?.id!==id||info.mimeType!=='application/vnd.google-apps.folder'||
      info.trashed!==false||info.capabilities?.canAddChildren!==true)
      throw Error('Selected Drive folder is not writable');
    return info;
  }
  async createChildFolder(name){
    if(typeof name!=='string'||name.length<3||name.length>80||
       name!==name.trim()||name!==name.normalize('NFC')||name.includes('..')||
       !/^[\\p{L}\\p{N} _().-]+$/u.test(name))
      throw new Error('Invalid folder name');
    let response;
    try{
      response=await this.fetcher('https://www.googleapis.com/drive/v3/files?'+
        'fields=id,name,mimeType,parents,trashed&supportsAllDrives=true',{
        method:'POST',redirect:'manual',headers:{
          Authorization:'Bearer '+this.accessToken,'Content-Type':'application/json'
        },
        body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',parents:[this.rootId]})
      });
    }catch{throw new DriveUploadFailure('transport');}
    if(!response||![200,201].includes(response.status))
      throw new DriveUploadFailure('provider',response?.status||0);
    let result;try{result=await response.json();}catch{throw new DriveUploadFailure('response');}
    if(!SAFE_FILE.test(result?.id||''))throw new DriveUploadFailure('response');
    await this.childFolder(result.id);
    return {id:result.id};
  }
  async removeChildFolder(folderId){
    await this.childFolder(folderId);
    const response=await this.fetcher('https://www.googleapis.com/drive/v3/files/'+
      encodeURIComponent(folderId)+'?supportsAllDrives=true',{
      method:'DELETE',redirect:'manual',headers:{Authorization:'Bearer '+this.accessToken}
    });
    if(response?.status!==204)throw Error('Could not clean up child folder');
  }
  async download(objectId,approvedParent=this.rootId){
    await this.metadata(objectId,approvedParent); // verify approved folder on every read
    const res=await this.request(
      "https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(objectId)+
      "?alt=media&supportsAllDrives=true");
    if(res.headers?.get("Content-Type")?.includes("text/html"))
      throw new Error("Drive response invalid");
    return res; // streaming body; no publicly shared URL or redirect
  }

  // R86: server creates a tenant-bound session, but the browser uploads
  // the file bytes directly to Google. This method NEVER accepts file bytes.
  async beginResumable({name,mimeType,size,ticketId}){
    if(typeof name!=='string'||name.length<5||name.length>120||
       !/^[\p{L}\p{N}._ ()-]+$/u.test(name)||name.includes('..')||
       !['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(mimeType)||
       !Number.isInteger(size)||size<22||size>1500000||
       !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(ticketId))
      throw Error('Invalid direct-upload metadata');
    const url='https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable';
    const metadata={name,mimeType,parents:[this.rootId],
      appProperties:{ai_law_upload_ticket:ticketId}};
    let res;
    try{
      res=await this.fetcher(url,{method:'POST',redirect:'manual',headers:{
        Authorization:'Bearer '+this.accessToken,
        'Content-Type':'application/json; charset=UTF-8',
        'X-Upload-Content-Type':mimeType,
        'X-Upload-Content-Length':String(size),
      },body:JSON.stringify(metadata)});
    }catch{throw new DriveUploadFailure('transport');}
    if(!res||res.status!==200)
      throw new DriveUploadFailure('provider',res?.status||0,res?await providerReason(res):'');
    const raw=res.headers.get('Location')||'';
    let u;
    try{u=new URL(raw);}catch{throw new DriveUploadFailure('response');}
    if(u.protocol!=='https:'||u.hostname!=='www.googleapis.com'||
       u.username||u.password||u.hash||
       u.pathname!=='/upload/drive/v3/files'||
       u.searchParams.get('uploadType')!=='resumable'||
       (u.searchParams.get('upload_id')||'').length<10)
      throw new DriveUploadFailure('response');
    return u.toString();
  }
  // R86: bind a new Drive object to the server-created ticket and approved
  // root. The browser cannot set/alter these metadata fields during PUT.
  async verifyDirectUpload(objectId,{ticketId,name,mimeType,size,approvedParent=this.rootId}){
    if(approvedParent!==this.rootId){
      const accountRoot=await this.accountRoot();
      if(approvedParent!==accountRoot)await this.writableFolder(approvedParent);
    }
    const info=await this.metadata(objectId,approvedParent);
    if(info.name!==name||info.mimeType!==mimeType||
       Number(info.size)!==size||
       info.appProperties?.ai_law_upload_ticket!==ticketId)
      throw new DriveUploadFailure('verify');
    return info;
  }

  // R72: upload only into the per-organization approved private root.
  // The caller must authorize MatterACL and store a D1 receipt before exposing it.
  async upload({name,mimeType,bytes}){
    if(typeof name!=='string'||!name||name.length>120||
       !/^[\p{L}\p{N}._ ()-]+$/u.test(name)||name.includes('..')||
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
    // Cloudflare Workers RequestInit accepts ReadableStream for outgoing
    // request bodies, not Blob directly. Stream the exact multipart bytes;
    // duplex:'half' also satisfies standard Fetch/Node stream handling.
    let res;
    try{
      res=await this.fetcher(url,{method:'POST',redirect:'manual',headers:{
        Authorization:'Bearer '+this.accessToken,
        'Content-Type':'multipart/related; boundary='+boundary
      },body:body.stream(),duplex:'half'});
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
