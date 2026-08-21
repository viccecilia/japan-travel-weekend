import {describe,expect,it} from 'vitest';
import {clientEnvironmentContract,safeClientConfig,serverEnvironmentContract,unavailableRealtimeProvider,validateIntegrationReadiness} from '../src/shared/config/integrationConfig';
import {createMemoryRepository} from '../src/shared/data/repository';
import {UnavailableMapProvider,UnavailableNotificationProvider} from '../src/shared/capabilities/adapters';
import {unavailableProductionBackend} from '../src/shared/backend/localBackend';

describe('真实服务接入准备',()=>{
  it('production 缺少配置时所有外部能力 fail closed',()=>{const result=validateIntegrationReadiness({mode:'production',clientEnv:{VITE_RUNTIME_MODE:'production'},serverEnv:{}});expect(result.ready).toBe(false);expect(Object.values(result.capabilities).every(x=>!x.enabled)).toBe(true)});
  it('只允许批准的公开客户端配置，拒绝 VITE 服务端秘密',()=>{expect(Object.keys(clientEnvironmentContract)).toEqual(['VITE_RUNTIME_MODE','VITE_API_BASE_URL','VITE_ENABLE_SEED_DATA','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','VITE_GOOGLE_MAPS_BROWSER_KEY']);expect(()=>safeClientConfig({VITE_PAYMENT_SECRET_KEY:'leak'})).toThrow('服务端秘密');expect(Object.keys(serverEnvironmentContract)).toContain('STRIPE_WEBHOOK_SECRET')});
  it('production repository 不泄露种子',()=>{const repository=createMemoryRepository(false);expect(repository.listDepartures()).toEqual([]);expect(repository.getTripRoomForGroup('dep-kyoto-seed-group-1')).toBeNull()});
  it('不可用 adapters 不伪装成功',async()=>{expect(unavailableProductionBackend.connected).toBe(false);expect(new UnavailableMapProvider().navigationUrl(null)).toBeNull();expect((await new UnavailableNotificationProvider().send()).accepted).toBe(false);expect((await unavailableRealtimeProvider.subscribePrivateVehicleGroup({accountId:'a',vehicleGroupId:'g',authorizationToken:'t'})).subscribed).toBe(false)});
  it('测试栈配置齐全仅表示通过配置门，不等于远程联调',()=>{const serverEnv={SUPABASE_URL:'https://project.test',SUPABASE_SERVICE_ROLE_KEY:'server-only',DATABASE_ENCRYPTION_KEY:'server-only',SESSION_SIGNING_SECRET:'server-only',STRIPE_SECRET_KEY:'sk_test_placeholder',STRIPE_WEBHOOK_SECRET:'whsec_placeholder',NOTIFICATION_PROVIDER:'test',NOTIFICATION_API_KEY:'server-only',NOTIFICATION_WEBHOOK_SECRET:'server-only'};const result=validateIntegrationReadiness({mode:'production',clientEnv:{VITE_RUNTIME_MODE:'production',VITE_API_BASE_URL:'https://api.example.test',VITE_GOOGLE_MAPS_BROWSER_KEY:'restricted'},serverEnv});expect(result.ready).toBe(true);expect(result.capabilities.payment.enabled).toBe(true)});
});
