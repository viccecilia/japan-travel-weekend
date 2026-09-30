import type {PublicRoutePolicyLoadResult} from './integrations/supabaseProduction';

export type RoutePolicyDisplayState=
  | {status:'loading'}
  | PublicRoutePolicyLoadResult;

export function routePolicyDisplay(state:RoutePolicyDisplayState){
  return {
    showSharedPolicy:state.status==='available',
    showLegacyFallback:state.status==='absent',
    showLoading:state.status==='loading',
    showRetry:state.status==='error',
  };
}
