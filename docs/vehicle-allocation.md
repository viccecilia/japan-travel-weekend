# Vehicle allocation — Demo 2.0

Orders purchase seats on a Departure. They do not reserve a particular physical seat or vehicle. Operations create Vehicle Assignments later.

## Sequential fill / fill-first

Vehicle 1 is filled before Vehicle 2 opens, then Vehicle 2 before Vehicle 3. A full 6-seat Alphard remains full when passenger 7 arrives; passenger 7 starts the next assignment. It is not silently replaced with a 9-seat vehicle. This protects vehicle, driver and guide cost efficiency and keeps operational groups stable.

Demo capacities are centrally configured as Alphard 6, Hiace 9, Hiace 13 and 25-seat vehicle 25. These are business-sale capacities, not manufacturer specifications, and remain adjustable Demo/TBD configuration. The pure allocation rule accepts an explicit capacity plan so future operations can choose available vehicle types, then applies fill-first without resizing prior full assignments.

The 80% load factor is an internal target only. Consumer UI uses clearly labelled sample states such as Available, Almost Full, Few seats left and Sold out. Future constraints include vehicle availability, staff language, route, cost and legal operating requirements.
