export type PaymentMode='test'|'live';
export type PaymentEnvironment=Partial<Record<
  'NODE_ENV'|'JTW_STRIPE_MODE'|'JTW_PRODUCTION_PAYMENT_AUTHORIZED'|'STRIPE_SECRET_KEY'|'STRIPE_WEBHOOK_SECRET',
  string
>>;

export type PaymentConfig={
  requestedMode:PaymentMode;
  effectiveMode:PaymentMode;
  modeSafe:boolean;
  secretKeySafe:boolean;
  webhookSecretSafe:boolean;
  usable:boolean;
  reasons:string[];
};

/** One fail-closed interpretation shared by runtime, adapters and probes. */
export function resolvePaymentConfig(env:PaymentEnvironment):PaymentConfig{
  const rawMode=env.JTW_STRIPE_MODE?.trim();
  const requestedMode:PaymentMode=rawMode==='live'?'live':'test';
  const validMode=rawMode==null||rawMode===''||rawMode==='test'||rawMode==='live';
  const liveAuthorized=requestedMode==='test'||(
    env.NODE_ENV==='production'&&env.JTW_PRODUCTION_PAYMENT_AUTHORIZED==='true'
  );
  const modeSafe=validMode&&liveAuthorized;
  const expectedPrefix=requestedMode==='live'?'sk_live_':'sk_test_';
  const secretKeySafe=env.STRIPE_SECRET_KEY?.startsWith(expectedPrefix)===true;
  const webhookSecretSafe=env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')===true;
  const reasons:string[]=[];
  if(!validMode)reasons.push('invalid_payment_mode');
  if(requestedMode==='live'&&env.NODE_ENV!=='production')reasons.push('live_requires_production_node_env');
  if(requestedMode==='live'&&env.JTW_PRODUCTION_PAYMENT_AUTHORIZED!=='true')reasons.push('live_not_authorized');
  if(!secretKeySafe)reasons.push('stripe_key_mode_mismatch');
  if(!webhookSecretSafe)reasons.push('stripe_webhook_unavailable');
  return {requestedMode,effectiveMode:requestedMode,modeSafe,secretKeySafe,webhookSecretSafe,usable:modeSafe&&secretKeySafe&&webhookSecretSafe,reasons};
}
