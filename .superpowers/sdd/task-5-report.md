Status
- DONE_WITH_CONCERNS

Changes
- Added `lib/deployment/engine.ts` with the deployment state machine for `plan`, `apply`, `destroy`, `getStatus`, `getLogs`, and `getOutputs`.
- Added `lib/deployment/engine-instance.ts` to expose a shared singleton engine instance.
- Added `tests/deployment/engine.test.ts` and followed TDD: wrote the failing import-based test first, verified the red failure, then implemented the engine and re-ran tests to green.

Tests
- `npm test -- tests/deployment/engine.test.ts` (initial RED: failed because `@/lib/deployment/engine` did not exist)
- `npm test -- tests/deployment/engine.test.ts` (GREEN: passed 3/3)
- `npm test -- tests/deployment` (passed 13/13)

Commits
- `1b733b6 feat(engine): 新增部署流程狀態機`

Self-Review
- Confirmed the engine persists deployment state through the existing workspace helpers and records Terraform command logs via the Task 4 runner callback.
- Confirmed `apply()` refuses to run without a successful prior `plan()`, and that successful apply persists parsed Terraform outputs.
- Kept scope limited to Task 5 files only and did not implement route-handler integration or later workflow steps.

Concerns
- The default runtime module path still points to `terraform/gcp`, which is specified by the brief but is not present in this worktree yet. Current tests inject a temporary module directory, so the engine is verified in isolation but depends on later Terraform module tasks for end-to-end runtime use.

## Task 5 Fix

Status
- DONE

Changes
- 在 `lib/deployment/engine.ts` 加入操作守衛：同程序 mutex 搭配 `.gtm-server-deployer/operation.lock/` 原子目錄鎖，將 `plan/apply/destroy` 的狀態切換與 Terraform 執行包在同一保護區段，避免並行操作同時啟動 Terraform。
- 在 `lib/deployment/workspace.ts` 讓 JSON 寫入改為暫存檔後 rename，降低併發讀寫產生半寫入 JSON 的風險，並新增 `clearTerraformOutputs()`。
- 在新一輪 `plan()` 開始時清除舊 outputs，並在 `destroy()` 成功後清除 outputs。
- 在 `tests/deployment/engine.test.ts` 新增並行 `plan()` 防護、`plan()` 清除 outputs、`destroy()` 清除 outputs 測試。

Commands and results
- `npm test -- tests/deployment/engine.test.ts`
  - RED: failed 3/6
  - failures:
    - concurrent plan test rejected with `SyntaxError: Unexpected end of JSON input`
    - new plan did not clear old outputs
    - destroy did not clear old outputs
- `npm test -- tests/deployment/engine.test.ts`
  - GREEN: passed 6/6
- `npm test -- tests/deployment/engine.test.ts tests/deployment/workspace.test.ts`
  - passed 10/10
- `npm run lint`
  - passed

Notes
- 並行測試目前驗證第二個 `plan()` 會被拒絕，因此維持單一本機 active deployment invariant。
