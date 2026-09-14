import {readFile} from 'node:fs/promises';
import {basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

const url=process.env.SUPABASE_URL??process.env.VITE_SUPABASE_URL;
const key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
const filePath=process.argv[2];
if(!url||!key||!serviceKey||!filePath)throw new Error('Spot video storage verification configuration is incomplete.');
const bytes=await readFile(filePath);
const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const batch=`v12-video-${Date.now()}`;
const password=`V12!${randomUUID()}aA9`;
const created=[];
const createIdentity=async(role)=>{
  const email=`${batch}-${role}@example.invalid`;
  const result=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:`V12 ${role}`}});
  if(result.error||!result.data.user)throw result.error??new Error('Test identity creation failed.');
  created.push(result.data.user.id);
  const profile=await admin.from('profiles').upsert({id:result.data.user.id,display_name:`V12 ${role}`,role});
  if(profile.error)throw profile.error;
  return email;
};
const attempt=async(email,path)=>{
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const login=await client.auth.signInWithPassword({email,password});
  if(login.error)throw login.error;
  const upload=await client.storage.from('route-media').upload(path,bytes,{contentType:'video/mp4',upsert:false});
  return {client,upload};
};
let operationsPath='';
try{
  const passengerEmail=await createIdentity('passenger');
  const operationsEmail=await createIdentity('operations');
  const anonymous=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const anonymousResult=await anonymous.storage.from('route-media').upload(`${batch}/anonymous/${basename(filePath)}`,bytes,{contentType:'video/mp4',upsert:false});
  const passenger=await attempt(passengerEmail,`${batch}/passenger/${basename(filePath)}`);
  operationsPath=`${batch}/operations/${basename(filePath)}`;
  const operations=await attempt(operationsEmail,operationsPath);
  if(!anonymousResult.error)throw new Error('Anonymous video upload unexpectedly succeeded.');
  if(!passenger.upload.error)throw new Error('Passenger video upload unexpectedly succeeded.');
  if(operations.upload.error)throw operations.upload.error;
  const publicUrl=operations.client.storage.from('route-media').getPublicUrl(operationsPath).data.publicUrl;
  const response=await fetch(publicUrl,{headers:{Range:'bytes=0-31'}});
  if(!response.ok)throw new Error(`Public playback probe failed: ${response.status}`);
  const removal=await operations.client.storage.from('route-media').remove([operationsPath]);
  if(removal.error)throw removal.error;
  operationsPath='';
  console.log(JSON.stringify({ok:true,batch,anonymousDenied:true,passengerDenied:true,operationsUploaded:true,publicPlaybackStatus:response.status,contentType:response.headers.get('content-type'),cleaned:true}));
}finally{
  if(operationsPath)await admin.storage.from('route-media').remove([operationsPath]);
  for(const id of created.reverse())await admin.auth.admin.deleteUser(id);
}
