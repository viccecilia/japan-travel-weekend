# Vehicle Trip Room — Demo 2.0

Each real Vehicle Assignment creates one Vehicle Group. Membership is limited to that vehicle's passengers, driver and assigned guide/driver-guide. A Departure can therefore have several separate rooms. Private phone numbers and LINE, WhatsApp or WeChat identities are never exposed.

The room opens on the previous evening according to centralized Demo configuration. Operational content leads: next meeting, countdown, meeting point, vehicle and driver, return count, map, actions, chat and boarding pass.

Driver location is intended to be visible to this vehicle's passengers during the trip. Passenger location is off by default, starts only with explicit consent, is visible only to the vehicle's assigned driver/guide, and stops on user request, expiry, return to vehicle or trip completion. Other passengers do not see it.

This release uses browser-only messages and photo placeholders. It has no GPS, Google Maps, upload, WebSocket or translation connection. A production design would send consent-scoped coordinates to an authenticated realtime service, render Google Maps in-app, and generate a Google Maps walking-navigation URL using the current authorized driver coordinate. Important messages retain the original text; a separate translation field is reserved.
