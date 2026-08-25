import {loadStripe, type Stripe} from '@stripe/stripe-js';

export function isStripeTestPublishableKey(value:string|undefined){
  return value?.startsWith('pk_test_')===true;
}

const publishableKey=import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
export const stripeTestClient:Promise<Stripe|null>|null=isStripeTestPublishableKey(publishableKey)?loadStripe(publishableKey!):null;
