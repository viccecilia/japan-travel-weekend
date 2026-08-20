# Japan Travel Weekend — Preview

An installable website and PWA/Web App prototype for small-group weekend trips from Osaka, operated by 株式会社大寅 / Daitora Group. This repository is independent from `japan-travel.info`.

## Stack

React, TypeScript, Vite, React Router, Vite PWA, Vitest and ESLint. Website, app and shared route data are separated under `src/website`, `src/app` and `src/shared`.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173/` for the website or `http://localhost:5173/app-demo` for the app.

## Quality commands

```bash
npm run typecheck
npm run lint
npm test
npm run check:content
npm run build
```

## Routes

Website: `/`, `/trips`, `/trips/:slug`, `/how-it-works`, `/rewards`, `/safety`, `/about`, `/app`.

App Demo: `/app-demo`, `/app-demo/login`, `/app-demo/trips`, `/app-demo/trips/:slug`, `/app-demo/booking/:slug`, `/app-demo/passengers`, `/app-demo/checkout`, `/app-demo/payment`, `/app-demo/payment-result`, `/app-demo/orders`, `/app-demo/orders/:id`, `/app-demo/boarding-pass/:id`, `/app-demo/rewards`, `/app-demo/referral`, `/app-demo/profile`.

## Demo data

The app stores its fake user, draft booking, demo orders, language, rewards progress, travel credit, referral code and UI preference under `jtw-demo-state-v1` in browser `localStorage`. Use **Profile → Reset Demo Data** to remove it.

## Limits

No real authentication, inventory, departure, price, payment, booking, boarding validation, translation service, database or API is connected. All unconfirmed commercial and operational fields are `null`, `TBD` or `preview`. Vietnamese and Nepali are entry points with Coming Soon messaging only. `noindex,nofollow` and a blocking `robots.txt` are intentional.

## Next phase

Confirm schedules, prices, capacities, inclusions and policies; obtain an image/licensing sign-off; commission professional translations; connect a secure backend and payment provider; add admin operations, transactional messaging and real QR verification; then perform legal, accessibility and pilot-trip reviews before removing Preview/noindex.
