/** Fetch only on explicit contact action; never retain contact details in UI state. */
export async function contactPassenger(
 load:()=>Promise<{phone:string}|null>,
 dial:(url:string)=>void,
):Promise<boolean>{
 try{
  const contact=await load();
  const phone=contact?.phone.trim().replace(/[\s()-]/g,'');
  if(!phone||!/^\+?\d{5,20}$/.test(phone))return false;
  dial('tel:'+phone);return true;
 }catch{return false}
}
