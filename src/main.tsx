import React from 'react';import ReactDOM from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';import {AppProvider} from './app/store';import {Router} from './router/Router';import './styles.css';import './golden-path.css';import './staff-v7.css';
import {runtimeMode} from './shared/config/businessRules';import {createSupabaseBrowserClient} from './shared/integrations/supabaseClient';import {ProductionBrowserServices} from './shared/backend/productionServices';
import {registerSW} from 'virtual:pwa-register';
document.documentElement.lang='zh-CN';
document.documentElement.dataset.buildSha=__JTW_BUILD_SHA__.slice(0,12);
if('serviceWorker' in navigator){
 const updateSW=registerSW({immediate:true,onNeedRefresh(){
  if(document.getElementById('jtw-update-ready'))return;
  const notice=document.createElement('aside');notice.id='jtw-update-ready';notice.className='jtw-update-ready';notice.setAttribute('role','status');
  notice.innerHTML='<b>新版已准备好</b><span>请先完成并保存当前操作，再更新页面。</span>';
  const button=document.createElement('button');button.type='button';button.textContent='现在更新';button.onclick=()=>void updateSW(true);notice.append(button);document.body.append(notice);
 }});
}
const supabase=runtimeMode==='production'?createSupabaseBrowserClient({url:import.meta.env.VITE_SUPABASE_URL??'',publishableKey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY??''}):null;
const services=supabase?new ProductionBrowserServices(supabase,import.meta.env.VITE_API_BASE_URL):null;
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><AppProvider services={services}><Router/></AppProvider></BrowserRouter></React.StrictMode>);
