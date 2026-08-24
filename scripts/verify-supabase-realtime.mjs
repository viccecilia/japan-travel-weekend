import { readFile } from "node:fs/promises";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const envPath = new URL("../.env.supabase.test.local", import.meta.url);
const envText = await readFile(envPath, "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, "")];
    }),
);

const mode = process.argv[2];
const vehicleGroupId = process.argv[3];
if (!['frozen', 'open'].includes(mode) || !/^[0-9a-f-]{36}$/i.test(vehicleGroupId ?? '')) {
  throw new Error('usage: node scripts/verify-supabase-realtime.mjs <frozen|open> <vehicle-group-uuid>');
}

const accounts = [
  ['owner', env.JTW_OWNER_EMAIL, env.JTW_OWNER_PASSWORD, true],
  ['driver', env.JTW_DRIVER_EMAIL, env.JTW_DRIVER_PASSWORD, true],
  ['operations', env.JTW_OPERATIONS_EMAIL, env.JTW_OPERATIONS_PASSWORD, true],
  ['unrelated', env.JTW_OTHER_EMAIL, env.JTW_OTHER_PASSWORD, false],
];
const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'];
if (required.some((key) => !env[key]) || accounts.some(([, email, password]) => !email || !password)) {
  throw new Error('missing ignored Supabase acceptance-test configuration');
}

const topic = `private:vehicle-group:${vehicleGroupId}`;
const sessions = [];
const received = new Map();

const join = (client, channel, timeoutMs = 10_000) => new Promise((resolve) => {
  const timer = setTimeout(() => resolve('TIMEOUT'), timeoutMs);
  channel.subscribe((status) => {
    if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
      clearTimeout(timer);
      resolve(status);
    }
  });
});

try {
  for (const [role, email, password, authorized] of accounts) {
    const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { timeout: 7_000 },
    });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error(`${role}: auth failed`);
    client.realtime.setAuth(data.session.access_token);
    received.set(role, []);
    const channel = client.channel(topic, { config: { private: true, broadcast: { ack: true, self: true } } })
      .on('broadcast', { event: 'acceptance' }, ({ payload }) => received.get(role).push(payload.marker));
    const status = await join(client, channel);
    if (authorized && status !== 'SUBSCRIBED') throw new Error(`${role}: expected subscription, received ${status}`);
    if (!authorized && status === 'SUBSCRIBED') throw new Error(`${role}: unrelated account subscribed`);
    sessions.push({ role, authorized, client, channel, status });
    console.log(`PASS ${role} ${authorized ? 'subscription' : 'subscription denied'}`);
  }

  for (const session of sessions.filter(({ authorized }) => authorized)) {
    const result = await session.channel.send({
      type: 'broadcast',
      event: 'acceptance',
      payload: { marker: `${mode}-${session.role}` },
    });
    if (mode === 'open' && result !== 'ok') throw new Error(`${session.role}: open-room send denied`);
    if (mode === 'frozen' && result === 'ok') throw new Error(`${session.role}: frozen-room send accepted`);
    console.log(`PASS ${session.role} ${mode === 'open' ? 'send' : 'send denied'}`);
  }

  if (mode === 'open') {
    await new Promise((resolve) => setTimeout(resolve, 800));
    const expected = sessions.filter(({ authorized }) => authorized).map(({ role }) => `open-${role}`);
    for (const session of sessions.filter(({ authorized }) => authorized)) {
      if (!expected.every((marker) => received.get(session.role).includes(marker))) {
        throw new Error(`${session.role}: did not receive every authorized broadcast`);
      }
      console.log(`PASS ${session.role} receive`);
    }
    if (received.get('unrelated').length !== 0) throw new Error('unrelated: received private broadcast');
    console.log('PASS unrelated receive denied');
  }
} finally {
  await Promise.allSettled(sessions.map(async ({ client, channel }) => {
    await client.removeChannel(channel);
    await client.auth.signOut();
    client.realtime.disconnect();
  }));
}

console.log(`PASS realtime ${mode}`);
