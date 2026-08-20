# Future data model

- `users`: identity, language, consent, status and referral ownership.
- `trips`: stable route content and publication state.
- `departures`: trip, date/time, meeting point and operational status; the public seat-selling unit.
- `seat_bookings`: order, departure, passenger count and allocation status; initially no vehicle.
- `vehicle_capacity_config`: centrally managed business-sale capacity per Demo vehicle type.
- `vehicle_assignments`: departure, sequence, vehicle type, booked/capacity and operational status.
- `vehicle_groups`: one private room per vehicle assignment, with membership derived from passenger and staff assignments.
- `staff_assignments`: vehicle, staff role and supported languages (EN/JA/ZH now; VI/NE reserved).
- `trip_rooms`: open/closed lifecycle, meeting points, messages, important original/translation fields and media references.
- `location_shares`: subject, authorized viewer scope, consent/start/expiry/stop timestamps; no public passenger visibility.
- `boarding_status`: passenger, vehicle assignment and returned/away/boarded/completed timestamps.
- `passengers`: order-scoped traveller and assistance information with retention controls.
- `orders`: buyer, departure, server-calculated totals, currency and lifecycle state.
- `payments`: provider references, attempts, amount, status and webhook audit metadata; never full card data.
- `boarding_passes`: opaque signed token, order, validity window and scan state; no personal details in the QR payload.
- `referrals`: direct referrer/referred relationship, attribution and fraud-review state.
- `travel_credits`: append-only earn/use/reversal ledger, expiry and source.
- `ambassador_commissions`: direct eligible order, provisional amount, approval and settlement state.

Use immutable identifiers, timestamps, least-privilege access, encrypted sensitive fields, explicit retention rules and auditable state transitions.

Core relationship: `Trip → Departure → Seat Bookings → Vehicle Assignments → Vehicle Groups → Trip Room → Boarding / Completed`. Private Group enquiries remain a separate future aggregate and never enter the public Departure seat pool.
