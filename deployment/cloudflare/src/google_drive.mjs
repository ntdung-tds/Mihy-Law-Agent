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
}
