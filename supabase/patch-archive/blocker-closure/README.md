# Archived drafts — not restore migrations

The three pre-existing, untracked SQL drafts were moved here byte-for-byte. Do not run them after the registered chain: they contain older query bodies and incompatible return shapes. No historical registered migration was edited or removed.

| Draft | SHA256 of preserved bytes | Disposition |
|---|---|---|
| 202609150920_operations_rpc_overprivilege_guard.sql | B9196FCD885CF7AC85BCCBAA444F33516D60D173CC40749AB3EF89FA4FE62F1E | Intent merged into 20260919100111; original dashboard return shape omits booked_seats |
| 202609150970_operations_rpc_strict_guard.patch.sql | 5CCBDD34146EFCB87631BAEED093554D79D7EE0B84731AE7235671E872BAFD18 | Intent merged into 20260919100111, using final registered bodies rather than reverting them |
| 202609150980_operations_rpc_driver_statistics_release_guard.patch.sql | 91CFB3273407D3F80AEB4DC06106948DA0027CF8E32DFB01A27DC193FB4C5C04 | Intent merged into 20260919100111; original scalar JSON release function incorrectly used RETURN QUERY |

The restore chain is **147 unchanged legacy migrations plus four reviewed CLI-generated additions**, not 147 plus the three raw drafts:

1. 20260919100111: 17 operations reads require authenticated operations authorization; preserve final return shapes and aggregation casts.
2. 20260919100132: exact versioned limited Boost consent is required at the RPC boundary.
3. 20260919100755: assignment-scoped driving/guiding authorization, explicit combined-duty grant and audit; existing RPC bodies and grants retained with entry guards.
4. 20260919101135: reconcile existing seven-language translation context/storage and report the new migration version. Spanish is not enabled.

`supabase/migration-lock.json` locks every migration's name, order and SHA256 over UTF-8 SQL with CRLF normalized to LF. `restore-preflight` still rejects missing, unexpected, reordered, empty or tampered migrations. It does not silently accept every file in the directory.

Verification: `scripts/verify-blocker-closure.mjs --rollback-test` applies the additions to the existing isolated test database inside one rollback transaction and executes business RPCs under existing identity claims. It never resets accounts, clears the project, or permanently installs a migration. This is incremental database verification, **not** a claim that a full clean restore or authenticated browser acceptance passed.
