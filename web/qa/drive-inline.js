/* R95: lazy-load the already-tested standalone browser→Drive uploader.
   Only in authenticated QA workspace; no file or access token sent to AI Law APIs. */
(() => {
 'use strict';
 const panel=document.getElementById('qa-direct-drive-panel');
 const status=document.getElementById('blob-status');
 if(!panel||!status)return;
 let started=false;
 function fail(){
  status.textContent='Chưa tải được thư viện Google. Kiểm tra kết nối rồi tải lại trang.';
  status.dataset.kind='error';
 }
 panel.addEventListener('toggle', () => {
  if(!panel.open||started)return;
  started=true;
  const gis=document.createElement('script');
  gis.src='https://accounts.google.com/gsi/client';
  gis.async=true;
  gis.onerror=fail;
  gis.onload=()=>{
   const verified=document.createElement('script');
   verified.src='/drive-blob.js';  // exact same tested JS as the standalone QA page
   verified.onerror=fail;
   document.head.appendChild(verified);
  };
  document.head.appendChild(gis);
 });
})();
