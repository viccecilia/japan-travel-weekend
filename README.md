# Japan Travel Weekend — Demo 2.0

An installable website and PWA/Web App prototype for weekend seat commerce and trip fulfilment from Osaka, operated by 株式会社大寅 / Daitora Group. Travellers buy seats on a Departure; operations later create sequentially filled Vehicle Assignments and private Vehicle Groups. This repository is independent from `japan-travel.info`.

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

Website: `/`, `/trips`, `/trips/:slug`, `/private-groups`, `/how-it-works`, `/rewards`, `/safety`, `/about`, `/app`.

App Demo adds `/app-demo/my-trip`, `/app-demo/my-trip/room` and `/app-demo/private-groups` to the existing browse, booking, order, boarding, rewards and profile routes.

## Demo data

The app stores its fake user, draft booking, demo orders, Trip Room interactions, language, rewards progress, travel credit, referral code and UI preference under `jtw-demo-state-v1` in browser `localStorage`. Use **Profile → Reset Demo Data** to remove it.

## Limits

No real authentication, inventory, GPS, maps, chat, photo upload, departure, price, payment, booking, boarding validation, translation service, database or API is connected. Map, countdown, driver location, messages and group data are labelled simulations. All unconfirmed commercial and operational fields are `null`, `TBD`, `sample` or `preview`. `noindex,nofollow` and a blocking `robots.txt` are intentional.

## Next phase

Confirm schedules, prices, capacities, inclusions and policies; obtain an image/licensing sign-off; commission professional translations; connect a secure backend and payment provider; add admin operations, transactional messaging and real QR verification; then perform legal, accessibility and pilot-trip reviews before removing Preview/noindex.
