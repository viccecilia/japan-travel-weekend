import type {Coordinates,MapProvider} from '../capabilities/adapters';
export class GoogleMapsAdapter implements MapProvider{
  connected:boolean;
  constructor(public readonly browserKey:string|undefined){this.connected=Boolean(browserKey?.trim())}
  navigationUrl(destination:Coordinates|null){if(!this.connected||!destination)return null;const point=`${destination.lat},${destination.lng}`;return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(point)}&travelmode=walking`}
}
