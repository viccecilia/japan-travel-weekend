# Business rules (preview)

All numeric values below are centralized in `src/shared/config/businessRules.ts` and remain provisional until approved.

## Seat commerce and operations

- One purchased unit is one seat on a Departure, not a vehicle or pre-assigned physical seat.
- Allocation is sequential fill: fill Vehicle 1, then open Vehicle 2, then Vehicle 3. Do not resize an already-full assignment merely because another booking arrives.
- Demo business-sale capacities are Alphard 6, Hiace 9, Hiace 13 and 25-seat vehicle 25. They are centralized Demo/TBD configuration.
- 80% load factor is an internal planning target, not a public promise or absolute departure threshold.
- Each Vehicle Assignment owns an isolated Vehicle Group. Members never receive other participants' private contact identities.
- Private Group / Charter requests are separate from the seat pool and do not have invented pricing.

## Members and travel credit

- A new member receives 5% off their first valid order.
- A direct referrer receives travel credit equal to 5% of the referred traveller's paid amount only after that trip is completed.
- Cancelled, refunded or no-show orders generate no reward. Any prematurely issued reward must be reversed on refund.
- Referral relationships have one layer. There is no upline/downline override.
- Travel credit is non-transferable, non-cashable, provisionally valid for 180 days and provisionally capped at ¥1,000 per order.

## VIP levels

- Explorer: registration.
- Traveller: 2 completed trips.
- Insider: 3 completed trips.
- VIP Traveller: 5 completed trips.
- A member may apply for ambassador review after 5 completed trips. Status never creates an automatic cash commission.

## Ambassador

Application and review are required. There is no joining fee or required purchase. Only the ambassador's direct valid referrals count. No income is earned from another referrer's activity. The provisional commission is 5%, entering settlement only after trip completion.

## Group leader

No group-leader reward, authority or commission has been approved. Future group-leader rules must be a separate, documented programme and must not introduce multi-level compensation.

## Anti-abuse

Future controls should prevent self-referral, duplicate identities, recycled payment methods, collusive bookings and rewards on refunded/no-show travel. Rewards remain pending through payment and travel completion; support must have an auditable reversal process.
