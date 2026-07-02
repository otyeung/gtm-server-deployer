# Task 4 Report

## Status
DONE

## Changes
- Added `DeploymentEngineError` and `normalizeError()` in `lib/deployment/errors.ts`.
- Added Terraform child-process runner in `lib/terraform/runner.ts` with redacted output and non-zero exit handling.
- Added tests for normalized deployment errors and Terraform runner behavior.

## Tests
- `npm test`
- `npm run lint`

## Commits
- `9a83842` — `feat(terraform): 新增 Terraform 執行器`

## Self-Review
- Verified explicit `DeploymentEngineError` instances round-trip unchanged.
- Verified permission-denied messages normalize to `permission_denied`.
- Verified Terraform stdout is redacted and non-zero exits reject with a clear message.
- Confirmed the runner waits for `onLog` callbacks before resolving.

## Concerns
- `lib/terraform/runner.ts` imports `server-only`, so the runner test mocks that module in Vitest.

## Fix Follow-up
- Fixed `lib/terraform/runner.ts` so `onLog` sync throws and rejected promises are captured as non-fatal `logCallbackErrors` on successful results.
- Added stream-aware stdout/stderr redaction that buffers secret boundaries so split sensitive values are redacted in both returned output and log callback output.
- Expanded `tests/terraform/runner.test.ts` to cover non-fatal `onLog` failures and split-chunk redaction.

## Verification Commands
- `npm test -- tests/terraform/runner.test.ts`
  - Result: PASS (`tests/terraform/runner.test.ts` 4 tests passed)
- `npm test -- tests/terraform/runner.test.ts tests/deployment/errors.test.ts`
  - Result: PASS (`tests/terraform/runner.test.ts` 4 tests passed, `tests/deployment/errors.test.ts` 2 tests passed)
- `npm run lint`
  - Result: PASS
