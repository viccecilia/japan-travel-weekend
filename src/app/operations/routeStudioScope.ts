import type {OperationsProduct} from '../../shared/integrations/supabaseOperations';

export const ROUTE_STUDIO_V1_SLUGS = [
  'kyoto-nara-classic',
  'amanohashidate-ine',
  'biwako-shirahige',
  'wakayama-family',
  'kobe-arima-rokko',
  'uji-nara-onsen',
  'miyama-katsuoji-arashiyama',
  'sanzenin-kibune-arashiyama-autumn',
] as const;

const ROUTE_STUDIO_EXCLUDED = 'arashiyama-train-hozugawa';

export const isRouteStudioProduct = (item: OperationsProduct) =>
  item.slug !== ROUTE_STUDIO_EXCLUDED &&
  (ROUTE_STUDIO_V1_SLUGS.includes(item.slug as typeof ROUTE_STUDIO_V1_SLUGS[number]) ||
    item.content.routeStudioV1 === true);
