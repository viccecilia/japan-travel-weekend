export type NavigationDestination={latitude:number;longitude:number;destinationName?:string};
export function walkingNavigationUrl({latitude,longitude}:NavigationDestination){
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${latitude},${longitude}`)}&travelmode=walking`;
}
export function openWalkingNavigation(destination:NavigationDestination,open:(url:string,target:string)=>unknown=window.open){const url=walkingNavigationUrl(destination);if(!url)return false;open(url,'_blank');return true}
export function guideTelephoneUrl(phone:string){const normalized=phone.replace(/[^+\d]/g,'');return normalized?`tel:${normalized}`:null}

