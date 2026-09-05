import {loadStripe, type Stripe} from '@stripe/stripe-js';

export function isStripeTestPublishableKey(value:string|undefined){
  return value?.startsWith('pk_test_')===true;
}

export function isStripeLivePublishableKey(value:string|undefined){
  return value?.startsWith('pk_live_')===true;
}

export function approvedStripePublishableKey(value:string|undefined,mode:string|undefined,liveEnabled:string|undefined){
  if(mode==='test')return isStripeTestPublishableKey(value);
  return mode==='live'&&liveEnabled==='true'&&isStripeLivePublishableKey(value);
}

const publishableKey=import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
export const stripeMode=import.meta.env.VITE_STRIPE_MODE==='live'?'live':'test';
export const stripeClient:Promise<Stripe|null>|null=approvedStripePublishableKey(publishableKey,stripeMode,import.meta.env.VITE_LIVE_PAYMENTS_ENABLED)?loadStripe(publishableKey!):null;
