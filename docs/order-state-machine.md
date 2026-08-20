# Order state machine

## Demo states

`pending_payment_demo → processing_demo → paid_demo → confirmed_demo → boarding_ready_demo → boarded_demo → completed_demo`

Terminal or exception paths are `cancelled_demo`, `refunded_demo` and `expired_demo`. The prototype may create an order directly as `boarding_ready_demo` to make the walkthrough concise. Every state name and screen remains explicitly labelled Demo.

## Future production intent

An internal order begins pending payment. A server-created payment attempt moves it to processing. Only a verified provider webhook may record paid. Operations then confirm capacity and issue a boarding pass. Scanning records boarding; operations closes the trip as completed. Expiry applies to unpaid attempts. Cancellation can occur before fulfilment; refund follows provider confirmation and reverses associated credits or commissions. Transitions must be idempotent, authorised and audited.
An internal order begins pending payment. A server-created payment attempt moves it to processing. Only a verified provider webhook may record paid. Operations then confirm capacity and issue a boarding pass. Scanning records boarding; operations closes the trip as completed. Expiry applies to unpaid attempts. Cancellation can occur before fulfilment; refund follows provider confirmation and reverses associated credits or commissions. Transitions must be idempotent, authorised and audited.

## Fulfilment state alongside the order

Confirmed seat bookings remain attached to the Departure while operations assigns vehicles with sequential fill. Each assignment creates a Vehicle Group; the room opens according to the centrally configured previous-evening rule. Passenger boarding progresses independently through `away → returned → boarded → completed`. Location sharing is a separate consent lifecycle and must end on stop, expiry, return or trip completion.
