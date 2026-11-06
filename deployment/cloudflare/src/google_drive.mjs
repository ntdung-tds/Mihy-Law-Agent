/** R43 Google Drive file-read provider boundary, QA ONLY.
 * Google Drive access token MUST come from the organization's own approved
 * OAuth grant: a ChatGPT Google Drive connector is not usable as a Worker
 * credential. No OAuth grant, refresh-token handling, upload or sharing yet.
 * This adapter does not replace independent MatterACL checks in the API.
 */
const SAFE_FILE=/^[A-Za-z0-9_-]{10,200}$/;
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
    const pre='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+
      JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: '+mimeType+
      '\r\nContent-Transfer-Encoding: binary\r\n\r\n';
    const body=new Blob([pre,bytes,'\r\n--'+boundary+'--\r\n']);
    const url='https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&'+
      'fields=id,name,mimeType,parents,trashed&supportsAllDrives=true';
    const res=await this.fetcher(url,{method:'POST',redirect:'manual',headers:{
      Authorization:'Bearer '+this.accessToken,
      'Content-Type':'multipart/related; boundary='+boundary
    },body});
    if(!res||![200,201].includes(res.status))throw Error('Drive upload unavailable');
    const out=await res.json();
    if(!SAFE_FILE.test(out?.id||'')||
       !Array.isArray(out.parents)||!out.parents.includes(this.rootId)||
       out.mimeType!==mimeType||out.name!==name||out.trashed===true)
      throw Error('Drive returned unapproved upload metadata');
    // Re-read trusted metadata, not merely the upload response.
    await this.metadata(out.id);
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
