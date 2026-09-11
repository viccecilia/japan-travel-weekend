type UpdateRegistration = {update:()=>Promise<unknown>};

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
  return ()=>{
    stopped=true;
    window.clearInterval(timer);
    window.removeEventListener('focus',check);
    window.removeEventListener('online',check);
    document.removeEventListener('visibilitychange',onVisible);
  };
}
