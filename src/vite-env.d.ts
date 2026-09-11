/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
declare const __JTW_BUILD_SHA__: string;
declare const __JTW_BUILD_TIME__: string;
interface ImportMetaEnv{readonly VITE_SUPABASE_URL?:string;readonly VITE_SUPABASE_PUBLISHABLE_KEY?:string;readonly VITE_API_BASE_URL?:string;readonly VITE_STRIPE_PUBLISHABLE_KEY?:string;readonly VITE_STRIPE_MODE?:'test'|'live';readonly VITE_LIVE_PAYMENTS_ENABLED?:'true'|'false';readonly VITE_GOOGLE_MAPS_BROWSER_KEY?:string;readonly VITE_GOOGLE_PLACES_READY?:string}
