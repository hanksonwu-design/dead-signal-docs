// Keep old shared scene links on the same host and GitHub Pages project path.
const SceneRedirect = {
 target(href) {
  const current=new URL(href),params=new URLSearchParams(current.hash.slice(1));
  if(!params.has('scene')||params.has('doc'))return null;
  const target=new URL('building/',current);
  target.hash=current.hash;
  return target.href;
 },
 follow() {
  const target=this.target(location.href);
  if(target)location.replace(target);
  return !!target;
 }
};
if(typeof module!=='undefined')module.exports=SceneRedirect;
else {window.SceneRedirect=SceneRedirect;SceneRedirect.follow();}
