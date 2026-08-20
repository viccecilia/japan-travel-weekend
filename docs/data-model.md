# Future data model

- `users`: identity, language, consent, status and referral ownership.
- `trips`: stable route content and publication state.
- `departures`: trip, date/time, meeting point, capacity and operational status.
- `passengers`: order-scoped traveller and assistance information with retention controls.
- `orders`: buyer, departure, server-calculated totals, currency and lifecycle state.
- `payments`: provider references, attempts, amount, status and webhook audit metadata; never full card data.
- `boarding_passes`: opaque signed token, order, validity window and scan state; no personal details in the QR payload.
- `referrals`: direct referrer/referred relationship, attribution and fraud-review state.
- `travel_credits`: append-only earn/use/reversal ledger, expiry and source.
- `ambassador_commissions`: direct eligible order, provisional amount, approval and settlement state.

Use immutable identifiers, timestamps, least-privilege access, encrypted sensitive fields, explicit retention rules and auditable state transitions.
