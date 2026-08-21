# Future payment architecture

This document is design intent only; the current product foundation contains no production payment integration.

1. The app creates an internal order without trusting client totals.
2. The backend calculates price, discount, travel-credit use and final payable amount.
3. Stripe handles supported credit card, PayPay and bank-transfer flows; PayPal is a supplementary provider.
4. Provider webhooks, verified server-side and processed idempotently, are the authority for payment status.
5. A boarding code is generated only after payment and operational confirmation.
6. Refund confirmation reverses referral rewards, travel credits and applicable ambassador settlement entries.
7. The platform never stores complete card details; providers host or tokenize sensitive payment input.

Apple Pay and Google Pay availability depends on the selected provider, device, region and merchant approval. Final provider support must be verified during implementation.
