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

The suite now has 48 tests, including late fallback success/failure after unmount,
auth changes during a deferred pre-POST SecureStore read, isolation of a new
account submit lock from old completion, and direct handler invocation for eight
invalid status values (asserting zero POSTs).

Rapid retry starts two read-only GETs; the older request signal is aborted and
its result/finally is ignored. This is minor redundant traffic, not duplicate
booking or state corruption. Retry behavior is intentionally unchanged.

Requirement traceability and outstanding acceptance gates are supplied separately in the handoff report. The suite renders real Counter/Badge, but mocks native hosts and APIs.
