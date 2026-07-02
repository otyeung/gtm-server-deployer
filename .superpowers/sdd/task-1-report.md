## Status
DONE_WITH_CONCERNS

## Changes
- Created the Next.js/Vitest scaffold, app shell, home page, navbar, utility helper, and smoke test.
- Kept the required `.worktrees/` ignore entry and merged the rest of the brief’s ignore rules into `.gitignore`.
- Adjusted `npm run lint` to use `eslint .` because `next lint` is unavailable in Next.js 16.

## Tests
- `npm test -- tests/app/home.test.tsx` ✅ after implementation; it failed first as expected before `app/page.tsx` existed.
- `npm run lint` ✅
- `npm run build` ✅

## Commits
- `4fb4037` — `chore(project): 建立 Next.js 專案骨架`

## Self-Review
- Verified the smoke test covers the required home-page text and deploy link.
- Checked that the scaffold exports `cn(...inputs: ClassValue[])` and that the path alias resolves from the repo root.
- Confirmed the root layout renders shared navigation and the home page renders the requested hero copy.

## Concerns
- `npm install` reported 2 moderate vulnerabilities in transitive dependencies.
- `next lint` is not supported in the installed Next.js version, so linting now runs through ESLint directly.
## Fix Report
- Updated the plan brief to require `npm run lint` backed by `eslint .` for Next.js 16 compatibility.
- `npm run lint` ✅
- `npm test -- tests/app/home.test.tsx` ✅
- `npm run build` ✅
