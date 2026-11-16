# SCRUM-72 regression tests

These tests execute the actual TSX screen and adapter after TypeScript transpilation,
using real React effects with mocked native hosts, router, authentication and API.
Focus timers are deliberately not mounted: this suite covers detail request lifecycle,
status normalization and submit locking, not native rendering or WITA timer acceptance.
No backend or Android runtime is started.

Prerequisites: Node 24, project dependencies (`npm ci`), and React test renderer
matching React 19.2.3. To keep project manifests/lockfiles unchanged, test-only tools
can be installed separately:

```powershell
$tools = Join-Path $env:TEMP 'Revira-SCRUM72-test-tools'
npm.cmd install --prefix $tools --ignore-scripts --no-audit --no-fund react@19.2.3 react-test-renderer@19.2.3
$env:TEST_TOOLS = $tools
node --test tests/scrum72-regression.test.cjs
```

The renderer emits its upstream deprecation notice. Native layout/gestures and
Android 360dp/412dp still require separate validation. `SCRUM72_SOURCE_ROOT` may
point at baseline app sources to reproduce failures without changing the checkout.

Backend dependency (unchanged): `/me` currently returns one membership summary;
eligibility for an approved renewal covering a later session still needs an agreed
contract from Orlando. This patch does not alter `/me` or invent renewal eligibility.

## Final verification coverage

The capacity-scope baseline had 64 tests, including late fallback success/failure after unmount,
auth changes during a deferred pre-POST SecureStore read, isolation of a new
account submit lock from old completion, and direct handler invocation for eight
invalid status values (asserting zero POSTs).

Rapid retry starts two read-only GETs; the older request signal is aborted and
its result/finally is ignored. This is minor redundant traffic, not duplicate
booking or state corruption. Retry behavior is intentionally unchanged.

Requirement traceability and outstanding acceptance gates are supplied separately in the handoff report. The suite renders real Counter/Badge, but mocks native hosts and APIs.


## Capacity scope revision (SC-01/SC-02/SC-03)

Sprint 3 has no maximum class capacity. The list/detail use `participants_count`
and optional/nullable `min_participants` only. Minimum is informational and never
restricts booking. Legacy maximum fields are ignored; legacy status `full` is
unknown and cannot book. Shared StatusBadge is unchanged; its full variant is no
longer called by the schedule flow or component preview.

The baseline lifecycle/booking checks and 16 capacity cases cover TC-SC01 through
TC-SC09 (with variants). TC-SC10 is the existing lifecycle, WITA, membership,
409/422, rebooking, and authoritative-counter suite. Actual list cards are now
rendered in the test harness and navigation payloads are checked.

The frontend schedule model now retains the API counter name `participants_count`.
SCRUM-73 integration must migrate consumers of the older normalized
`current_participants` field. The adapter still accepts that legacy field as input,
but never emits maximum-capacity rules. No polling implementation is changed.

Per Orlando's scope decision supplied for this revision, future approved renewal
is an accepted known limitation/follow-up, not a blocker for SCRUM-72. The single
membership date checks and fail-closed behavior remain. SCRUM-97 cancellation is
out of scope. API/Android acceptance and Amel's review are still required.


## HTTP 409 reconciliation follow-up

A POST conflict remains an error/info popup, not a new booking success. The screen
then re-fetches `/api/v1/me` and `/api/v1/member/bookings` through the existing
sequence/epoch/auth/abort guards. A synchronous conflict flag blocks stale submit
callbacks while reconciliation is pending or failed. Only validated server data
clears that flag. GET failure leaves the error/retry UI fail-closed.

The booking resource supplies the authoritative `schedule.participants_count`.
If unavailable, the screen reads the existing `/api/v1/class-schedules` endpoint
with `date_from`/`date_to` for the session date. The guarded fallback snapshot also
retains current session status; it never invents a counter or increments on 409.
This is a one-off reconciliation/retry, not SCRUM-73 polling.

The former regression that expected Booking to remain active after HTTP 409 has
been replaced by TC-409-01..07, with booked/attended/cancelled, GET failure/retry,
missing/invalid counter, out-of-order booking and fallback responses, auth changes,
unmount, 201/401/422 preservation and rapid confirmation coverage. Tests render
the actual React screen with deferred promises and mock APIs/native hosts.

Targeted execution (from `member-app`, with the existing TEST_TOOLS prerequisite):

```powershell
$env:TEST_TOOLS = Join-Path $env:TEMP 'Revira-SCRUM72-test-tools'
node --test --test-name-pattern='TC-409|GET bookings|pending eligibility|missing membership|cancelled booking|auth changes during pre-POST|old pre-POST' tests/scrum72-regression.test.cjs
npx.cmd tsc --noEmit
npm.cmd run lint
```

No backend suite, real Android acceptance or Railway requests are implied by these
regressions. Re-run the original two-client conflict on Android after this patch is
reviewed, including GET failure/retry and account/route changes during reconciliation.
