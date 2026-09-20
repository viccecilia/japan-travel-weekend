import {validateWebReadySpotVideo} from './productSpotVideo';

// Reuses the existing H.264/AAC and 50 MB boundary. No transcoding service.
// Decode before uploading, then derive the poster instead of accepting a typed URL.
export async function prepareDiscoverVideo(file:File):Promise<File> {
 const problem=await validateWebReadySpotVideo(file);
 if(problem)throw new Error(problem);
 return new Promise((resolve,reject)=>{
   const url=URL.createObjectURL(file);
   const video=document.createElement('video');
   video.muted=true;video.playsInline=true;video.preload='auto';
   const cleanup=()=>{clearTimeout(timer);video.removeAttribute('src');video.load();URL.revokeObjectURL(url)};
   const fail=()=>{cleanup();reject(new Error('无法解码视频，请上传网页兼容 H.264/AAC MP4'))};
   const timer=setTimeout(fail,15000);
   video.onerror=fail;
   video.onloadeddata=()=>{video.currentTime=Math.min(1,video.duration/2)};
   video.onseeked=()=>{
     const canvas=document.createElement('canvas');
     canvas.width=Math.min(720,video.videoWidth);
     canvas.height=Math.round(canvas.width*video.videoHeight/video.videoWidth);
     const context=canvas.getContext('2d');
     if(!context){fail();return}
     context.drawImage(video,0,0,canvas.width,canvas.height);
     canvas.toBlob(blob=>{cleanup();if(blob)resolve(new File([blob],'discover-poster.jpg',{type:'image/jpeg'}));else reject(new Error('封面生成失败，请重试'))},'image/jpeg',.85);
   };
   video.src=url;
 });
}
