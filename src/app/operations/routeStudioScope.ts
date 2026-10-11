import type {OperationsProduct} from '../../shared/integrations/supabaseOperations';

export const ROUTE_STUDIO_V1_SLUGS = [
  'kyoto-nara-classic',
  'amanohashidate-ine',
  'biwako-shirahige',
  'wakayama-family',
  'kobe-arima-rokko',
  'uji-nara-onsen',
  'miyama-katsuoji-arashiyama',
  'arashiyama-train-hozugawa',
  'sanzenin-kibune-arashiyama-autumn',
] as const;

export const isRouteStudioProduct = (item: OperationsProduct) =>
  ROUTE_STUDIO_V1_SLUGS.includes(item.slug as typeof ROUTE_STUDIO_V1_SLUGS[number]) ||
  item.content.routeStudioV1 === true;
