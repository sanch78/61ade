/**
 * Same-origin GET URL of a GET-capable read action (`content_stream`, `thumbnail_get`) for
 * `<img>`/`<video>` sources: the session cookie authenticates it and the server checks the ACL on
 * every request. `version` (for example the revision) only keys the browser cache.
 */
export const actionUrl=(resource:string,action:string,id:string,version?:string):string=>{
  const url=new URL(location.href);url.hash="";
  url.search=new URLSearchParams({blade:"1",resource,action,id,...(version?{v:version}:{})}).toString();
  return url.toString();
};
