import React from 'react';import ReactDOM from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';import {AppProvider} from './app/store';import {Router} from './router/Router';import './styles.css';import './golden-path.css';import './staff-v7.css';
import {runtimeMode} from './shared/config/businessRules';import {createSupabaseBrowserClient} from './shared/integrations/supabaseClient';import {ProductionBrowserServices} from './shared/backend/productionServices';
document.documentElement.lang='zh-CN';
if('serviceWorker' in navigator){
 let refreshing=false;
 navigator.serviceWorker.addEventListener('controllerchange',()=>{
  if(refreshing)return;
  refreshing=true;
  window.location.reload();
 });
}
const supabase=runtimeMode==='production'?createSupabaseBrowserClient({url:import.meta.env.VITE_SUPABASE_URL??'',publishableKey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY??''}):null;
const services=supabase?new ProductionBrowserServices(supabase,import.meta.env.VITE_API_BASE_URL):null;
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><AppProvider services={services}><Router/></AppProvider></BrowserRouter></React.StrictMode>);
