type UpdateRegistration = {update:()=>Promise<unknown>};
type UpdateServiceWorker = (reloadPage?:boolean)=>Promise<unknown>;

export function installServiceWorkerUpdateChecks(
  registration:UpdateRegistration,
  intervalMs=60*60*1000,
){
  let stopped=false;
  const check=()=>{
    if(stopped||document.visibilityState==='hidden')return;
    void registration.update().catch(()=>undefined);
  };
  const onVisible=()=>{if(document.visibilityState==='visible')check()};
  window.addEventListener('focus',check);
  window.addEventListener('online',check);
  document.addEventListener('visibilitychange',onVisible);
  const timer=window.setInterval(check,intervalMs);
  check();
  return ()=>{
    stopped=true;
    window.clearInterval(timer);
    window.removeEventListener('focus',check);
    window.removeEventListener('online',check);
    document.removeEventListener('visibilitychange',onVisible);
  };
}

/** Activate one waiting worker per currently loaded build. The marker prevents
 * a failed or duplicate update notification from causing a reload loop. */
export function activateServiceWorkerUpdate(update:UpdateServiceWorker,buildSha:string){
  const key=`jtw-pwa-update-requested:${buildSha}`;
  if(sessionStorage.getItem(key)==='1')return false;
  sessionStorage.setItem(key,'1');
  void update(true).catch(()=>sessionStorage.removeItem(key));
  return true;
}
