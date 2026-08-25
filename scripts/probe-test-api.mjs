const baseUrl = process.env.JTW_TEST_API_URL ?? "https://api-test.japan-travel.info";
const parsed = new URL(baseUrl);
if (parsed.protocol !== "https:" || parsed.hostname !== "api-test.japan-travel.info") {
  throw new Error("probe is restricted to the approved HTTPS test API");
}

const concurrency = 5;
const requests = 25;
const results = [];
for (let offset = 0; offset < requests; offset += concurrency) {
  const batch = Array.from({ length: Math.min(concurrency, requests - offset) }, async () => {
    const started = performance.now();
    const response = await fetch(new URL("/ready", parsed), { signal: AbortSignal.timeout(10_000) });
    const body = await response.json();
    return { status: response.status, ok: body.ok === true, ms: Math.round(performance.now() - started) };
  });
  results.push(...await Promise.all(batch));
}
const failures = results.filter(({ status, ok }) => status !== 200 || !ok);
const times = results.map(({ ms }) => ms).sort((a, b) => a - b);
const summary = {
  ok: failures.length === 0,
  endpoint: parsed.hostname,
  requests,
  failures: failures.length,
  minMs: times[0],
  medianMs: times[Math.floor(times.length / 2)],
  maxMs: times.at(-1),
};
console.log(JSON.stringify(summary));
if (!summary.ok) process.exitCode = 1;
