import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({plugins:[react(),VitePWA({registerType:'autoUpdate',manifest:{name:'Japan Travel Weekend',short_name:'JT Weekend',description:'面向在日外国人的关西周末小团座位预订与旅行履约服务',theme_color:'#102a43',background_color:'#f6f4ef',display:'standalone',start_url:'/app',icons:[{src:'/icons/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any maskable'}]}})],test:{environment:'jsdom',setupFiles:'./tests/setup.ts'}});
