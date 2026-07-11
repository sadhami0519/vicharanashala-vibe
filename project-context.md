# ViBe — Project Context

> **Start-here document for developers joining the ViBe team.**
> Other root `.md` files go deeper on specific features — pointers at the end.

---

## TL;DR

- **What:** ViBe — adaptive educational platform inspired by the Vikram-and-Betaal tale
- **Repo:** `C:\projects\vibe\vicharanashala-vibe` (Windows); upstream: `vicharanashala/ViBe` (GitHub)
- **Stack:** Node/TypeScript backend + React/Vite frontend; MongoDB; Firebase Auth (emulated locally)
- **Boot:** `pnpm install` → Docker MongoDB → Firebase Auth emulator → `pnpm dev` in `backend/` and `frontend/`
- **Docs:** <https://vicharanashala.github.io/vibe/>
- **License:** MIT
- **Current MVP focus:** Spaced Repetition feature (backend ✅ done, frontend ⚠️ pending — see §7)

---

## Table of Contents

| § | Topic |
|---|---|
| 1 | What is ViBe? |
| 2 | Tech Stack |
| 3 | Repo Layout |
| 4 | Local Development Setup |
| 5 | Required Environment Variables (canonical) |
| 6 | Architecture Conventions |
| 7 | Current Feature Focus — Spaced Repetition (SM-2) |
| 8 | Other Features (background) |
| 9 | Code Patterns & Conventions |
| 10 | Testing |
| 11 | Troubleshooting |
| 12 | Backend source-code reference (1st codebase pass) |
| 13 | Where to Find More |
| 14 | Frontend source-code reference (1st codebase pass) |
| 15 | Workspace-wide context (CLI, docs, e2e, CI, deploy) |

**Reading order suggestion for a new dev:** TL;DR → §2 → §3 → §4 → §6 (architecture conventions) → §5 (env vars) → §12 (backend reference) → §14 (frontend reference) → §15 (deploy/CI). Pick up §7 and §9 as needed.

---

## 1. What is ViBe?

ViBe continuously assesses student comprehension and prompts review of material when needed, ensuring robust mastery before advancement. It uses smart question generation, adaptive reviews, and AI-driven proctoring (smart proctoring + engagement verification) to foster deeper learning.

**Inspiration:** The classical Indian tale of Vikram and Betaal — Betaal challenges King Vikramaditya with riddles, and any incorrect answer prompts a review. ViBe reinforces learning by requiring students to revisit content if their responses do not meet the mark.

---

## 2. Tech Stack

### Backend (`backend/`)

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20 LTS or 22 |
| Language | TypeScript (`ESNext` + `NodeNext`) |
| Framework | Express via [`routing-controllers`](https://github.com/typestack/routing-controllers) |
| DI | [Inversify](https://inversify.io/) — one `ContainerModule` per module |
| Database | MongoDB (raw driver — **no Mongoose**) |
| Auth | Firebase Admin SDK (emulator in dev) |
| Validation | `class-validator` + `class-transformer` (via routing-controllers decorators) |
| Scheduling | `node-cron` |
| Email | `nodemailer` (single `MailService` wrapper) |
| Testing | Vitest + `mongodb-memory-server` |
| API Docs | Scalar UI at `/reference` (auto-generated from decorators) |

### Frontend (`frontend/`)

| Layer | Technology |
|-------|------------|
| Framework | React 19 |
| Build | Vite 6 |
| Language | TypeScript |
| Routing | TanStack Router v1 — **code-based, NOT file-based** |
| Server State | TanStack Query v5 |
| API Client | `openapi-fetch` + `openapi-react-query` (auto-generated from backend OpenAPI) |
| Component Library | shadcn/ui + Radix UI |
| Styling | Tailwind CSS v4 |
| Icons | `@mui/icons-material` |
| Global State | Zustand |
| Auth | Firebase Web SDK |

### External services (local dev)

- **MongoDB 7** — Docker container `vibe-mongo`
- **Firebase Auth Emulator** — runs locally on port 9099; no real Firebase account needed

---

## 3. Repo Layout

```
vicharanashala-vibe/
├── backend/                          # Node.js API server
│   ├── src/
│   │   ├── modules/                  # Feature modules (one folder per domain)
│   │   │   ├── spacedRepetition/     # Current MVP feature — see §7
│   │   │   ├── users/                # Includes ProgressService (completion hook)
│   │   │   ├── quizzes/              # Questions, attempts, etc.
│   │   │   ├── notifications/        # In-app + email
│   │   │   └── ...
│   │   ├── shared/                   # DB, types, repositories
│   │   │   └── database/
│   │   │       ├── interfaces/       # INotification, IUser, etc.
│   │   │       └── providers/
│   │   │           └── mongo/        # MongoDatabase, repositories
│   │   ├── config/                   # App config (env, smtp, ...)
│   │   ├── utils/                    # startCron.ts and helpers
│   │   └── app.ts                    # Express + routing-controllers bootstrap
│   ├── .env                          # Local config (not committed; see .example.env)
│   ├── firebase.json                 # Firebase emulator config
│   ├── tsconfig.json                 # Includes path aliases like #spacedRepetition/*
│   └── package.json
├── frontend/                         # React/Vite SPA
│   ├── src/
│   │   ├── app/
│   │   │   ├── pages/                # Role-specific pages (student/, teacher/, shared/)
│   │   │   └── routes/
│   │   │       └── router.tsx        # ⚠️ Full route tree (TanStack Router v1 code-based)
│   │   ├── components/               # Shared UI; ui/ = shadcn primitives
│   │   ├── hooks/                    # Auto-generated from OpenAPI schema
│   │   ├── layouts/                  # student-layout, teacher-layout
│   │   ├── lib/                      # openapi.ts (fetch + auth), api-client.ts, firebase.ts
│   │   ├── store/                    # Zustand stores + auth context
│   │   └── types/                    # TypeScript types per domain
│   ├── .env.example                  # Copy to .env; VITE_* vars
│   └── package.json
├── docs/                             # Project documentation (source for GitHub Pages)
├── README.md                         # Project intro
├── feature-context.md                # ⭐ Main feature doc (spaced repetition)
├── feature-user-flow-backend.md      # Backend flow walkthrough
├── vibe_local_setup_guide.md         # Beginner dev setup
├── vibe_review_question_endpoint_prompt.md   # Review endpoint prompt
├── vibe_review_reminder_email_prompt.md      # Email delivery prompt
├── FINAL_INTEGRATION_CHECKLIST.md    # Older emotion-analytics feature (~80% done)
├── EMOTION_*.md                      # Emotion analytics docs (older phase)
├── LICENSE                           # MIT
└── package.json                      # pnpm workspaces
```

---

## 4. Local Development Setup

> Detailed step-by-step in `vibe_local_setup_guide.md`. Quick reference here.

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 20 LTS or 22 | `node --version` |
| pnpm | 10+ | `npm install -g pnpm` |
| Docker Desktop | Latest | Windows: WSL 2 backend |
| Firebase CLI | Latest | `npm install -g firebase-tools` |

### First-time setup

```bash
# 1. Clone + install deps (do NOT pass --ignore-scripts)
git clone https://github.com/<your-username>/ViBe.git
cd ViBe
pnpm install
pnpm binaries     # one-time: downloads MongoDB test binary (~200 MB)

# 2. Start MongoDB (one time only)
docker run -d --name vibe-mongo -p 27017:27017 mongo:7

# 3. Start the Firebase Auth emulator
cd backend
firebase emulators:start --only auth --project demo-test
# Leave this terminal running — emulator stays up
```

Then in separate terminals:

```bash
# Terminal 3 — backend
cd backend
cp .example.env .env       # fill SMTP creds + Firebase web config
pnpm dev                   # → http://localhost:3141

# Terminal 4 — frontend
cd frontend
cp .env.example .env       # fill VITE_FIREBASE_* and VITE_BASE_URL
pnpm dev                   # → http://localhost:5173
```

### Services & URLs

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | <http://localhost:5173> | The web app |
| Backend | <http://localhost:3141> | API server |
| API docs | <http://localhost:3141/reference> | Scalar UI (interactive OpenAPI) |
| Firebase emulator | <http://127.0.0.1:9099> | Fake auth (no real Firebase account needed) |
| MongoDB | `localhost:27017` | Database (Docker container) |

### Daily restart

```bash
docker start vibe-mongo                                      # if container stopped
cd backend && firebase emulators:start --only auth --project demo-test
cd backend && pnpm dev
cd frontend && pnpm dev
```

**Or use the `vibe` CLI instead.** From the repo root:

```bash
pnpm vibe start                           # backend + frontend
pnpm vibe start backend frontend docs     # explicit list
pnpm vibe start auth                      # just the Firebase Auth emulator
pnpm vibe start all                       # backend + frontend + docs + both emulators
pnpm vibe test                            # backend tests (vitest)
pnpm vibe help
```

The `vibe start` command wraps the multi-terminal flow above; see §15.2 for command semantics and which processes run where. The first-time setup script `pnpm vibe setup` (or `scripts/setup-win.ps1` / `scripts/setup-unix.sh`) is the recommended way to bootstrap a fresh machine.

---

## 5. Required Environment Variables

### Backend (`backend/.env`)

```dotenv
NODE_ENV=development
APP_PORT=3141
APP_URL=http://localhost:3141
APP_ORIGINS=http://localhost:5173
APP_ROUTE_PREFIX=/api
APP_MODULE=all
FRONTEND_URL=http://localhost:5173
ADMIN_PASSWORD=<set-something>

# MongoDB
DB_URL=mongodb://localhost:27017
DB_NAME=vibe

# Firebase Auth emulator
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
FIREBASE_EMULATOR_HOST=127.0.0.1:4000
GCLOUD_PROJECT=demo-test

# Spaced Repetition cron gate (default: false)
ENABLE_SPACED_REPETITION_JOB=false

# Email (Gmail SMTP — App Password, not login password)
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Optional — disable when not in use
SENTRY_DSN=
ENABLE_DB_BACKUP=false
ENABLE_HP_JOB=false
IS_RECAPTCHA_ENABLED=false
RECAPTCHA_SECRET_KEY=
```

### Frontend (`frontend/.env`)

```dotenv
VITE_BASE_URL=http://localhost:3141/api

VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<project>
VITE_FIREBASE_STORAGE_BUCKET=<project>.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
# Optional — only if Analytics is enabled in the Firebase project:
VITE_FIREBASE_MEASUREMENT_ID=...
```

`VITE_*` values come from Firebase Console → ⚙️ Project Settings → Your apps → Web app.

> **Two optional flags the backend does NOT need but the frontend honours** (see §14.3):
> - `VITE_USE_FIREBASE_EMULATOR=true` — points the Firebase Web SDK at the local emulator (must be set whenever you're running against the emulator instead of a real Firebase project).
> - `VITE_USE_MOCK_API` — legacy mock-API toggle used by `src/lib/api-client.ts`; **do not** depend on this for new code.

---

## 6. Architecture Conventions

### Backend module structure

Every feature module follows this shape under `backend/src/modules/<name>/`:

```
<module>/
├── interfaces/        # TypeScript interfaces (I...Item.ts, etc.)
├── types.ts           # DI symbols — <NAME>_TYPES.XxxRepo, <NAME>_TYPES.XxxService
├── repositories/
│   └── providers/
│       └── mongodb/   # One repository per MongoDB collection
├── services/          # Business logic (SM-2 algorithm, seed/review/etc.)
├── classes/validators/  # @Body, @Params, response DTOs with class-validator
├── controllers/       # @JsonController routes
├── cron/              # Optional; node-cron jobs
├── container.ts       # Inversify ContainerModule (one module per directory)
└── index.ts           # Exports <name>ContainerModules[] and <name>ModuleControllers
```

### DI wiring

- Every module's `container.ts` exports a single `ContainerModule` binding repositories and services as singletons
- `index.ts` exports `*ContainerModules[]` (for DI loading) and `*ModuleControllers` (for routing-controllers)
- The root loader calls `loadAppModules('all')` which dynamically imports every `modules/*/index.js`
- **Module dependencies** (e.g. `users` needs `QuestionBankRepo` from `quizzes`) are added to the dependent module's `*ContainerModules[]` array explicitly

### Path aliases

`backend/tsconfig.json` defines aliases. Whenever adding a new module, add a path mapping:

```json
{
  "compilerOptions": {
    "paths": {
      "#spacedRepetition/*": ["./modules/spacedRepetition/*"],
      "#root/*": ["./*"]
    }
  }
}
```

### MongoDB

- **No Mongoose** — raw driver; collection names are explicit
- New collection indexes declared in `MongoDatabase.ensureIndexes()` (auto-runs on first connection)
- Repository pattern: every collection has a singleton `<Name>Repository` injected via Inversify

### Frontend

- **Routing is code-based, not file-based.** All routes live in `frontend/src/app/routes/router.tsx`. Adding a route means creating a `new Route({ ... })` instance and chaining `.addChildren([...])` onto a parent.
- **Auth guards** in routes use `beforeLoad` and synchronously read Zustand via `useAuthStore.getState()` — they run *outside* the React tree.
- **API hooks** in `hooks/hooks.ts` are **auto-generated** from the backend OpenAPI schema. Do not edit by hand — after backend API changes, run `pnpm copy` then `pnpm gen-schema` (from `frontend/`). See §14.2 + §15.5.
- **Bearer token** flows from localStorage (`firebase-auth-token`) via `openapi-fetch` `onRequest` middleware, auto-refreshed on 401.

### Auth model

- **Backend:** every protected route uses `@Authorized()` from `routing-controllers`; Firebase Admin SDK verifies the JWT and populates the user identity on the request
- **Frontend:** Zustand `useAuthStore` (`{ user, isAuthenticated, isAuthReady, token }`) wrapped by `AuthProvider` (listens to `onAuthStateChanged`, refreshes token every 50 min)

---

## 7. Current Feature Focus — Spaced Repetition (SM-2)

This is the team's active GitHub issue / acceptance-criteria feature. **Authoritative source: `feature-context.md`.** Summary:

### What's done ✅

- Backend module under `backend/src/modules/spacedRepetition/`
- MongoDB collection `review_items` with 3 indexes (`next_review_at`, `(student_id, course_id)`, unique `(student_id, question_id)`)
- Course completion hook: `ProgressService.stopItem()` → post-transaction → `triggerSpacedRepetitionSeed()` → seeds one `ReviewItem` per question (not per quiz item)
- SM-2 algorithm in `SpacedRepetitionService._applySM2()`
- 5 REST endpoints: `/seed`, `/review`, `/schedule`, `/course/:courseId`, `/notifications`
- `GET /api/quizzes/questions/:questionId/review` — strips correct answer, normalises types
- In-app notifications via `NotificationService.notifyReviewReminder()`
- Email delivery via `MailService.sendMail()` + `ReviewReminderEmail.createReviewReminderEmailMessage()`
- Hourly `node-cron` job, gated by `ENABLE_SPACED_REPETITION_JOB=true` (default `false`)
- Tests: 14 SM-2 unit tests + 18 repo integration tests (vitest + `mongodb-memory-server`)

### What's pending ❌ (MVP acceptance criteria)

1. **Review session screen** (frontend) — Card UI with question + options + three buttons ("Got it" / "Unsure" / "Missed"); flow = fetch due items → fetch question → submit quality → show next-interval feedback. Cap ~10–15 cards/session.
2. **Retention dashboard** (frontend) — Per-course due counts + retention health % (avg EF normalised to 0–100), full schedule, per-course opt-out toggle.

### Quality → SM-2 q mapping

| UI button | q |
|-----------|---|
| `got_it`   | 5 |
| `unsure`   | 3 |
| `missed`   | 1 |

### Quick-Reference API

```
POST /api/spaced-repetition/:studentId/seed
POST /api/spaced-repetition/:studentId/review
GET  /api/spaced-repetition/:studentId/schedule
GET  /api/spaced-repetition/:studentId/course/:courseId
PATCH /api/spaced-repetition/:studentId/notifications
GET  /api/quizzes/questions/:questionId/review
```

---

## 8. Other Features (background)

| Feature | State | Source-of-truth doc |
|---------|-------|---------------------|
| Emotion analytics | ~80% done (backend complete + student-side integration; teacher item-stats + student journey dashboards still pending) | `FINAL_INTEGRATION_CHECKLIST.md` + `EMOTION_*.md` |
| Superadmin pages | Status unknown — open question | — |
| Course invites + follow-up invites | Complete; wired from `ProgressService.stopItem()` | `feature-context.md` (mentions) |
| HP / Emotion cron `ENABLE_HP_JOB` | Optional; off by default | — |

---

## 9. Code Patterns & Conventions

### Adding a new backend module

1. Pick a domain name; create `backend/src/modules/<domain>/`
2. Mirror the module file structure from §6
3. Add `#<domain>/*` path mapping in `backend/tsconfig.json`
4. Wire `*ContainerModules[]` + `*ModuleControllers` in `<domain>/index.ts`
5. (If your module depends on `notifications` or `users` for cross-cutting concerns) add those module references to your `*ContainerModules[]` explicitly

### Adding a new backend endpoint

1. Define a DTO in `classes/validators/<Domain>Validator.ts` using `class-validator` decorators
2. Add a method on `<Domain>Service.ts`
3. Add a `@JsonController` route in `<Domain>Controller.ts`; mark protected with `@Authorized()`
4. Decorate the response type with `@ResponseSchema(...)` for OpenAPI generation
5. Run `npx tsc --noEmit` (filter by module name to reduce noise)
6. Write tests — service-level unit tests + repo-level integration tests against `mongodb-memory-server`

### Adding a new frontend route

1. Open `frontend/src/app/routes/router.tsx`
2. Create a `new Route({ getParentRoute, path, component, beforeLoad? })` instance
3. Add to its parent's `.addChildren([...])` array (or to the top-level `routeTree`)
4. For protected pages, attach role check in `beforeLoad` using `useAuthStore.getState()` and `throw redirect({ to: '/auth' })`

### Adding a new API hook (frontend)

```bash
# After backend API changes:
cd frontend
pnpm copy               # regenerates openapi.json from backend
pnpm gen-schema         # regenerates src/lib/api/schema.ts
```

`pnpm gen-schema` runs `pnpx openapi-typescript openapi.json --output src/lib/api/schema.ts`. The hooks layer (`src/hooks/hooks.ts`) appears to have been generated separately before today — verify the regeneration command if you need to refresh hooks after schema drift (the only hand-written hook that does NOT match the OpenAPI contract is `src/hooks/spaced-repetition.ts` — see §14.7).

**Do not edit `src/lib/api/schema.ts` or `src/hooks/hooks.ts` by hand** — both will be overwritten when regenerated.

### Polling / mutation pattern (frontend)

```typescript
const { mutateAsync, isPending, error } = useSubmitQuiz();
try {
  await mutateAsync({ params: { path: { quizId } }, body: { answers: [...] } });
} catch (e) {
  toast({ title: error?.message ?? 'Failed' });
}
```

---

## 10. Testing

### Backend

```bash
cd backend
pnpm test:ci                                 # all tests, 287+ passing
npx vitest run src/modules/spacedRepetition/tests/   # single module
npx tsc --noEmit | Select-String "spacedRepetition|ProgressService|users/index"   # module-filtered type check
```

Each module's tests live in `src/modules/<module>/tests/` and use `vitest` + `mongodb-memory-server` for repository integration tests.

### Frontend

The frontend has **no test script** wired today — `frontend/package.json` does not declare `test`, `test:e2e`, or similar. `pnpm test` from `frontend/` will fail. `e2e/` (Playwright) covers the only end-to-end testing surface; see §15.6.

If/when adding unit tests to `frontend/`, the canonical choice is **Vitest** + `@testing-library/react` (matches the backend toolchain; reuses the existing `vite` config and `vite-plugin-comlink` awareness). Avoid Jest — it conflicts with Vite's ESM pipeline.

---

## 11. Troubleshooting

| Symptom | Cause / Fix |
|---------|-------------|
| `Environment variable DB_URL is not set` | `backend/.env` missing or misnamed (must be exactly `.env`, not `.env.txt`) |
| Auth routes return `invalid-credential` | Firebase emulator not running — restart it |
| `ECONNREFUSED 127.0.0.1:27017` | MongoDB container stopped — `docker start vibe-mongo` |
| `pnpm: command not found` | Close + reopen terminal (pnpm needs PATH) |
| Frontend blank white page | Check browser console; usually a `.env` value is wrong |
| Sign up says "email already in use" | Emulator user from prior session — use different email, or `firebase emulators:start --only auth --project demo-test --clear` |
| Review emails not sending | Set `SMTP_USER` + `SMTP_PASS` in `backend/.env` (use Gmail **App Password**, not login password); restart backend |

For symptom-driven diagnosis beyond this table (CI failures, deploy issues, WebRTC flake), see §15.9 "Where to look when something breaks".

---

## 12. Backend source-code reference (after first codebase pass)

This section was added after a first read of the actual backend source. It augments §§1–11 with concrete file paths and behaviours that the root `.md` files don't spell out.

### 12.1 Entry point & boot sequence

| Stage | File | What it does |
|-------|------|--------------|
| Sentry init | `backend/src/instrument.ts` | Imported first via dynamic `await import('./instrument.js')` in `index.ts`; Sentry setup is environment-aware |
| Top-level wiring | `backend/src/index.ts` | Loads `appConfig`, registers global middleware (`loggingHandler`, `corsHandler`), starts Express via `useExpressServer()`, mounts `/reference` Scalar UI, opens MongoDB, starts crons after 30s |
| Module discovery | `backend/src/bootstrap/loadModules.ts` | Dynamically imports every `modules/*/index.js`, collects `*ModuleControllers`, `*ModuleValidators`, `*ContainerModules[]`; in `APP_MODULE=all` mode builds a single Inversify `Container` and registers `InversifyAdapter` with `routing-controllers` |
| Cron init | `backend/src/bootstrap/jobs/index.ts` | Imports each job file for side effects; `initJobs()` just logs. Real cron registration is per-module (e.g. `spacedRepetition/cron/reviewNotificationJob.ts`) |
| Unhandled-rejection guard | `backend/src/index.ts` top | `process.on('unhandledRejection', ...)` is a no-fatal log — prevents any async cron error from killing the server |

### 12.2 Inversify symbol map (global)

`backend/src/types.ts` exports `GLOBAL_TYPES` for cross-module singletons:

| Symbol | Backing class |
|--------|---------------|
| `Database` | `MongoDatabase` (singleton) |
| `uri` | `dbConfig.url` (constant) |
| `dbName` | `dbConfig.dbName` (constant) |
| `UserRepo` | `UserRepository` |
| `CourseRepo` | `CourseRepository` |
| `InviteRepo` | `InviteRepository` |
| `EnrollmentRepo` | `EnrollmentRepository` |
| `SettingRepo` | `SettingRepository` |
| `SlotBookingRepo` | `SlotBookingRepository` |
| `MailService` | `MailService` (notifications module) |
| `CourseVersionService` | (course version service) |

Each module also has its own `<NAME>_TYPES` (e.g. `SPACED_REPETITION_TYPES.ReviewItemRepo`). New modules should follow this pattern.

### 12.3 `MongoDatabase` index management

`backend/src/shared/database/providers/mongo/MongoDatabase.ts#ensureIndexes()` runs **once per process on first successful connection**. Indexes declared there:

- `auditTrails` — compound index on `actor`, `context.courseId`, `context.courseVersionId`, `createdAt:-1`
- `review_items` — three indexes (one per spec from the spaced-repetition feature):
  - `next_review_at:1` (cron query)
  - `(student_id:1, course_id:1)` (dashboard)
  - `(student_id:1, question_id:1)` unique (double-seed guard)

**When adding a new collection index:** edit `ensureIndexes()` directly. Do not create indexes elsewhere.

Connection options used by `MongoClient`:
- `maxPoolSize: 50`, `minPoolSize: 10`, `maxIdleTimeMS: 60_000`
- `connectTimeoutMS: 20_000`, `socketTimeoutMS: 30_000`
- `ssl: true`, `tls: true`, `tlsAllowInvalidCertificates: false`, `retryWrites: true`
- Override with `SKIP_DB_CONNECTION=true` if you need the server up without DB (e.g. for OpenAPI spec dump)

### 12.4 Transaction wrapper

`backend/src/shared/classes/BaseService.ts#_withTransaction(operation)` is the standard pattern for all writes. Wraps the callback in a `ClientSession` with:

- `readPreference: 'primary'`
- `readConcern: 'snapshot'`
- `writeConcern: 'majority'`
- **Up to 3 retries on `TransientTransactionError`** (the Mongo driver label)

Every service that writes more than one document extends `BaseService` and uses `_withTransaction(async session => { ... })`. Pass `session` to every repository call inside.

### 12.5 Authorisation

- `backend/src/shared/functions/authorizationChecker.ts` — called by `routing-controllers` for every `@Authorized()` route. Expects a `Bearer` JWT in `Authorization`, validates via `FirebaseAuthService.getCurrentUserFromToken()`.
- `backend/src/shared/functions/currentUserChecker.ts` — populates the `currentUser` request property after auth passes.
- **All spaced-repetition routes are `@Authorized()`.** No per-route ability checks yet.

### 12.6 Config files (`backend/src/config/`)

| File | Purpose | Key exports |
|------|---------|-------------|
| `app.ts` | Core app config | `appConfig.{port, isProduction, isStaging, isDevelopment, module, routePrefix, origins, ENABLE_*_JOB}` |
| `db.ts` | MongoDB | `dbConfig.{url, dbName}` |
| `smtp.ts` | Gmail SMTP | `smtpConfig.auth.{user, pass}` |
| `ai.ts` | Anthropic AI proxy | `aiConfig.*` (proxied via `AI_PROXY_ADDRESS` if set) |
| `storage.ts` | GCP buckets | `storageConfig.*` |
| `sentry.ts` | Sentry DSN + env | `sentryConfig.*` |
| `index.ts` | barrel re-export of `app`, `db`, `sentry` | — |

All configs read from `process.env` via `utils/env.ts` (`env(key, default)` and `envOrFail(key)`). `dotenv.config()` is called at module load with `path: .env.${NODE_ENV}`.

### 12.7 Workers (`backend/src/workers/`)

Long-running jobs that don't fit into `node-cron`:

| File | Purpose |
|------|---------|
| `clone-course.worker.ts` (+ `pool.ts`, `examples.ts`) | Background cloning of a course version — used when teachers fork a course |
| `invite-email.worker.ts` (+ `pool.ts`) | Bulk-sends invite emails (uses a worker pool to throttle Gmail SMTP) |

These are not loaded automatically by `index.ts`; they're spawned explicitly from controllers/services that need them.

### 12.8 Shared layer (`backend/src/shared/`)

```
shared/
├── classes/                # BaseService
├── constants/              # transformerConstants
├── database/
│   ├── interfaces/         # IUserRepository, ICourseRepository, INotification, ...
│   └── providers/mongo/
│       ├── MongoDatabase.ts
│       └── repositories/   # One *Repository.ts per top-level collection
├── functions/              # abilityDecorator, authorizationChecker, currentUserChecker,
│                           #   generateOpenApiSpec, verifyRecaptcha
├── interfaces/             # models.ts, quiz.ts, reports.ts (cross-module types)
└── middleware/             # ApiKeyAuthMiddleware, auditTrails, corsHandler,
                            #   errorHandler, loggingHandler, rateLimiter
```

**Pattern:** every MongoDB collection has both an `I...Repository` interface (in `shared/database/interfaces/`) and a concrete `...Repository` class in `shared/database/providers/mongo/repositories/`. Tests can substitute the interface.

### 12.9 Middleware order (from `index.ts`)

1. `loggingHandler` — request log
2. `express.json` etc. (via `useExpressServer`)
3. `cors` — `appConfig.origins`, methods `GET/POST/PUT/PATCH/DELETE/OPTIONS`, allows `X-API-Key`
4. `HttpErrorHandler` (routing-controllers middleware)
5. Per-controller `authorizationChecker` + `currentUserChecker`
6. (Production/staging only) `Sentry.setupExpressErrorHandler`
7. Health: `GET /health` (no auth)
8. OpenAPI: `GET /openapi-spec.json` (no auth)
9. Docs: `GET /reference` (no auth) — Scalar UI

### 12.10 Complete environment variable catalogue

Sourced directly from `backend/.example.env` and `backend/src/config/`:

#### App
| Var | Default | Notes |
|-----|---------|-------|
| `NODE_ENV` | `development` | One of `development` / `staging` / `production` |
| `APP_PORT` | `3141` | HTTP listen port |
| `PORT` | — | Alias occasionally used by Cloud Run; falls back to `APP_PORT` |
| `APP_MODULE` | `all` | One of `all` / `auth` / `users` / `courses` / `quizzes` (see `app.ts` enum) |
| `APP_URL` | `http://localhost:3141` | Public backend URL |
| `APP_ROUTE_PREFIX` | `/api` | Mounted on all routing-controllers routes |
| `APP_ORIGINS` | `http://localhost:5173` | CORS allow-list (CSV) |
| `FRONTEND_URL` | `http://localhost:5173` | Used in email templates + redirects |
| `ADMIN_PASSWORD` | — | Seed admin password for first-time setup |

#### Database
| Var | Notes |
|-----|-------|
| `DB_URL` | e.g. `mongodb://localhost:27017` (local) or Atlas SRV string |
| `DB_NAME` | e.g. `vibe` |
| `MONGOMS_DEBUG` | Verbose MongoDB memory-server logs (test runs) |
| `SKIP_DB_CONNECTION` | Set `true` to start the server without connecting (useful for spec generation) |

#### Firebase
| Var | Notes |
|-----|-------|
| `FIREBASE_AUTH_EMULATOR_HOST` | `127.0.0.1:9099` for local emulator |
| `FIREBASE_EMULATOR_HOST` | `127.0.0.1:4000` (full emulator hub; usually not needed) |
| `GCLOUD_PROJECT` | `demo-test` for local; real project ID in prod |
| `FIREBASE_CLIENT_EMAIL` | Service-account email (prod) |
| `FIREBASE_PRIVATE_KEY` | Service-account private key (prod; newlines escaped as `\n`) |
| `FIREBASE_PROJECT_ID` | Real Firebase project ID (prod) |
| `FIREBASE_API_KEY` | Web API key |
| `FIREBASE_STORAGE_BUCKET` | e.g. `<project>.appspot.com` |

#### Email (Gmail SMTP)
| Var | Notes |
|-----|-------|
| `SMTP_USER` | Gmail address |
| `SMTP_PASS` | Gmail **App Password** (16 chars), not login password |

#### AI (Anthropic)
| Var | Notes |
|-----|-------|
| `AI_SERVER_IP` | Self-hosted model host |
| `AI_SERVER_PORT` | Self-hosted model port |
| `AI_PROXY_ADDRESS` | Optional proxy URL — when set, AI calls are routed through it instead of direct |
| `ANTHROPIC_CRED` | Anthropic API key (base64 encoded) |
| `ANTHROPIC_MODEL` | Model name, e.g. `claude-3-5-sonnet-...` |

#### GCP / Storage
| Var | Notes |
|-----|-------|
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to GCP service-account JSON |
| `GOOGLE_ANOMALY_BUCKET` | GCS bucket for anomaly-detection assets |
| `GOOGLE_FACES_BUCKET` | GCS bucket for face-recognition assets |
| `GOOGLE_AI_SERVER_BUCKET` | GCS bucket for AI server assets |
| `GCP_BACKUP_BUCKET` | DB backup destination |
| `GCP_BACKUP_ACTIVITY_BUCKET` | Activity-event backup destination |

#### Feature flags / cron gates
| Var | Default | Gates |
|-----|---------|-------|
| `ENABLE_SPACED_REPETITION_JOB` | `false` | Hourly review-notification cron |
| `ENABLE_HP_JOB` | `false` | HP system cron (HP allocation, etc.) |
| `ENABLE_DB_BACKUP` | `false` | Daily MongoDB backup cron |
| `ENABLE_FOLLOWUP_INVITE_JOB` | `true` | Follow-up invite backfill job |
| `ENABLE_FULFILLMENT_JOB` | `true` | Slot-fulfillment evaluation job |

#### Security / Other
| Var | Notes |
|-----|-------|
| `MEDIA_ENCRYPTION_KEY` | Symmetric key for media-encryption at rest |
| `SENTRY_DSN` | Sentry project DSN; if empty, Sentry is no-op |
| `IS_RECAPTCHA_ENABLED` | `true` / `false` |
| `RECAPTCHA_SECRET_KEY` | Google reCAPTCHA secret (server-side verification) |

#### Frontend (`frontend/.env` — all `VITE_*`)
| Var | Source |
|-----|--------|
| `VITE_BASE_URL` | e.g. `http://localhost:3141/api` |
| `VITE_FIREBASE_API_KEY` | Firebase console |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase console |
| `VITE_FIREBASE_PROJECT_ID` | Firebase console |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase console |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase console |
| `VITE_FIREBASE_APP_ID` | Firebase console |

### 12.11 Spaced-repetition feature — concrete file map

| File | Purpose |
|------|---------|
| `modules/spacedRepetition/types.ts` | `SPACED_REPETITION_TYPES` (ReviewItemRepo, SpacedRepetitionService, SpacedRepetitionController) |
| `modules/spacedRepetition/container.ts` | `spacedRepetitionContainerModule` — binds repo, service, controller as singletons |
| `modules/spacedRepetition/index.ts` | Re-exports `*ContainerModules[]`, `*ModuleControllers`; also pulls in `sharedContainerModule`, `authContainerModule`, `usersContainerModule`, `notificationsContainerModule` so this module works standalone |
| `modules/spacedRepetition/interfaces/IReviewItem.ts` | `IReviewItem` doc shape, `RecallQuality` ('got_it' \| 'unsure' \| 'missed'), `RECALL_QUALITY_MAP`, `DEFAULT_SM2_STATE` (n=0, EF=2.5, interval_days=1) |
| `modules/spacedRepetition/services/SpacedRepetitionService.ts` | SM-2 algorithm in `_applySM2()` (private, pure); public methods `seedSchedule`, `submitReview`, `getSchedule`, `getCourseRetention`, `updateNotificationPreference` — all wrapped in `_withTransaction` |
| `modules/spacedRepetition/repositories/providers/mongodb/ReviewItemRepository.ts` | `create`, `createMany`, `findDueItems`, `findByStudent`, `findByStudentAndCourse`, `findByStudentAndQuestion`, `update`, `updateOptOut` |
| `modules/spacedRepetition/cron/reviewNotificationJob.ts` | `scheduleReviewNotificationJob()` — `0 * * * *` Asia/Kolkata, gated by `ENABLE_SPACED_REPETITION_JOB`, groups by student, one notification per student, per-student errors isolated |
| `modules/spacedRepetition/classes/validators/SpacedRepetitionValidator.ts` | `SeedScheduleBody`, `SubmitReviewBody`, `UpdateOptOutBody`, `StudentIdParam`, `StudentCourseParams`, response DTOs |
| `modules/spacedRepetition/controllers/SpacedRepetitionController.ts` | 5 endpoints, all `@Authorized()` and OpenAPI-decorated |
| `modules/spacedRepetition/tests/sm2.test.ts` | 14 unit tests for SM-2 algorithm |
| `modules/spacedRepetition/tests/ReviewItemRepository.test.ts` | 18 integration tests against `mongodb-memory-server` |
| `modules/spacedRepetition/tests/ReviewReminderEmail.test.ts` | Email content tests |

**Integration call sites:**
- `modules/users/services/ProgressService.ts#triggerSpacedRepetitionSeed()` — private method called from a post-transaction block in `stopItem()` once a course is freshly completed. Walks every `QUIZ` item in the course version, resolves each `questionBankRef` to a `QuestionBank` doc, dedupes bank IDs, then collects question IDs. Calls `spacedRepetitionService.seedSchedule()`. **All errors are swallowed — seeding must never break completion.**
- `modules/notifications/services/NotificationService.ts#notifyReviewReminder()` — called by the cron. Creates in-app `review_reminder` notification, then best-effort sends the email via `MailService`. Email-failure logs but doesn't throw.
- `modules/notifications/classes/transformers/ReviewReminderEmail.ts` — builds text + branded HTML email with optional `ctaUrl` (CTA button).
- `modules/notifications/services/MailService.ts` — single `nodemailer.createTransport({ service: 'gmail' })` wrapper around `sendMail()`.
- `modules/quizzes/controllers/QuestionController.ts#getForReview()` — `GET /quizzes/questions/:questionId/review`; normalises every question type to `ReviewQuestionResponse` (`{id, body, type, hint, options[], isParameterized}`). Strips correct answers.
- `modules/quizzes/interfaces/review.ts` — `ReviewOption` (`{key, text}`) and `ReviewQuestionResponse` types.

### 12.12 Existing cron jobs (from `utils/startCron.ts` + `bootstrap/jobs/`)

| Job | Source | Schedule (local) | Gate |
|-----|--------|------------------|------|
| `DeleteCronService` | `modules/hpSystem` (or similar) | varies | varies |
| Progress update cron | `modules/users` | varies | varies |
| `AutoEjectionEngine` | `modules/ejectionPolicy` | varies | `ENABLE_HP_JOB` or similar |
| `reviewNotificationJob` | `modules/spacedRepetition/cron` | `0 * * * *` Asia/Kolkata | `ENABLE_SPACED_REPETITION_JOB` |
| `allocateHp` | `bootstrap/jobs/allocateHp.ts` | side-effect import | (config-dependent) |
| `backfillFollowUpInvites` | `bootstrap/jobs/backfillFollowUpInvites.ts` | side-effect import | `ENABLE_FOLLOWUP_INVITE_JOB` |
| `evaluateSlotFulfillment` | `bootstrap/jobs/evaluateSlotFulfillment.ts` | side-effect import | `ENABLE_FULFILLMENT_JOB` |
| `backupDb` | `bootstrap/jobs/backupDb.ts` | side-effect import | `ENABLE_DB_BACKUP` |

The `bootstrap/jobs/index.ts` barrel file is imported once from `utils/startCron.ts` (or equivalent). Each individual job file calls `cron.schedule(...)` at import time.

### 12.13 Backend module inventory (live list from `src/modules/`)

| Module | One-liner |
|--------|-----------|
| `announcements` | Course announcements |
| `anomalies` | Anomaly detection (integrates with `GOOGLE_ANOMALY_BUCKET`) |
| `auditTrails` | Cross-cutting audit logging (uses `auditTrails` collection + middleware) |
| `auth` | Firebase Auth wrapping (`FirebaseAuthService`, login/signup/verify-token controllers) |
| `courseRegistration` | Student → course enrollment workflows |
| `courses` | Course + course-version management (incl. `CourseVersionService`) |
| `ejectionPolicy` | Policy-based student ejection + appeals; drives `AutoEjectionEngine` cron |
| `emotions` | Emotion analytics (older ~80% done feature) |
| `genAI` | Anthropic / self-hosted AI integration (uses `aiConfig`) |
| `hpSystem` | HP (Happiness Points?) ledger + activities + cohorts |
| `notifications` | In-app + email notifications (`NotificationService`, `MailService`, `InviteService`) |
| `projects` | Project submissions / grading surface |
| `quizzes` | Questions, attempts, submissions, feedback, question banks, `getForReview` |
| `reports` | Reporting endpoints (uses `shared/interfaces/reports.ts`) |
| `setting` | Per-course + global settings |
| `spacedRepetition` | **Current MVP feature** (see §7) |
| `studentQuestions` | Student-authored questions (?) |
| `users` | User + progress + enrollment services |

---

## 13. Where to Find More

| Topic | File |
|-------|------|
| Spaced-repetition feature (authoritative) | `feature-context.md` |
| Spaced-repetition backend flow | `feature-user-flow-backend.md` |
| Step-by-step dev setup (beginner-friendly) | `vibe_local_setup_guide.md` |
| `GET /quizzes/questions/:questionId/review` endpoint | `vibe_review_question_endpoint_prompt.md` |
| Email reminder delivery (Step 11) | `vibe_review_reminder_email_prompt.md` |
| Emotion analytics (older, ~80% done) | `FINAL_INTEGRATION_CHECKLIST.md`, `EMOTION_*.md` |
| Project intro | `README.md` |
| Public docs site (Markdown source in `docs/`) | <https://vicharanashala.github.io/vibe/> |
| API reference (live, after `pnpm dev`) | <http://localhost:3141/reference> |
| OpenAPI JSON (live) | <http://localhost:3141/openapi-spec.json> |

---

## 14. Frontend source-code reference

> *Companion to §12 (backend reference). Same conventions: locations only, brief callouts, no code blocks unless needed for clarity.*

### 14.1 Layout at a glance

- **Root:** `C:\projects\vibe\vicharanashala-vibe\frontend`
- **Entry / app shell:** `src/app/main.tsx` → `src/app/app.tsx` (the top-level router wrapper). Note: there is also a `src/app.tsx` at the repo-root `src/` from an older layout — do not import from there. Treat `src/app/*` as canonical.
- **Pages:** split by role under `src/app/pages/` — `shared/`, `student/`, `teacher/` (plus role folders inside each).
- **Components:** `src/components/` (sub-folders: `ai/`, `hp-system/`, `magicui/`, `announcements/`, `Auth/`, `course/`, `dashboard/`, `theme-provider/`, `theme-toggle/`, `ui/`; top-level files include `FlagModal.tsx`, `floating-video.tsx`, `NotificationDropdown.tsx`, `RegistrationNotificationDropdown.tsx`, etc.).
- **Hooks:** `src/hooks/` (NOT `src/app/hooks`) — see §14.6.
- **State:** `src/store/` (Zustand) + `src/store/context/` (React context wrappers).
- **Workers:** `src/workers/` (`whisperWorker.js`, `BlurDetectorWorker.ts`, `FaceDetectorWorker.ts`) — run off-main-thread via `vite-plugin-comlink`.
- **Lib (clients / helpers):** `src/lib/` (OpenAPI client, Firebase, query client, hp-system API wrapper) and `src/utils/` (auth helpers, proctoring, ejectionPolicyUtils, `AudioUtils.ts`, `helpers.ts`, `utils.ts`, `ethicsConsent.tsx`).
- **Types:** `src/types/` (~28 files, one per domain: `auth.types.ts`, `course.types.ts`, `quiz.types.ts`, `notification.types.ts`, `ejection-policy.types.ts`, `emotion.types.ts`, etc.) + a `policies/` sub-folder (e.g. `policy.types.ts`).
- **Constants:** `src/constants/ethicsConsent.tsx` (only file).
- **Assets:** `src/assets/globals.css` (only file — Tailwind entrypoint).
- **Static / public:** `public/img/`, `public/templates/`, `public/workers/`.

### 14.2 Build, dev, deploy

| Concern | File | Notes |
|---|---|---|
| Frontend package manifest | `frontend/package.json` | `pnpm` workspace-less. Node toolchain = `node:20-alpine` in Docker. |
| Vite config | `vite.config.ts` | `vite-plugin-comlink`, `@` alias → `src/`, dev proxy `/api` → `http://localhost:4001` (NB: backend actually runs on **3141** — proxy target looks stale; verify before relying on it), sourcemaps on, manual vendor chunks (`react`, `react-dom`). |
| TypeScript (app) | `tsconfig.app.json` | `target: ES2020`, `strict: true`, `noUnusedLocals/Parameters: true`, alias `@/* → ./src/*`, `moduleResolution: bundler`, `allowImportingTsExtensions: true`. |
| TypeScript (root refs) | `tsconfig.json` | Just path alias + project references to `./tsconfig.app.json` and `./tsconfig.node.json`. |
| Deployment script | `scripts/deploy.sh` | Bash. Stashes → switches to `saaransh-deploy` repo → rsyncs → `pnpm install && pnpm vite build && firebase deploy` → commits & pushes. |
| Dockerfile | `Dockerfile` | Multi-stage: `node:20-alpine` (build with corepack + pnpm) → `nginx:stable-alpine` (serve). |
| Nginx config | `nginx.conf` | Used in the runtime stage. |
| Firebase hosting | `firebase.json` | Hosting + rewrites config for Firebase Hosting deploys. |
| Env | *No committed `.env.example`* | Vars are read directly via `import.meta.env.VITE_*`. Documented locally only — see §14.3. |
| OpenAPI spec | `frontend/openapi.json` (~**5 MB**, 280+ `/api/...` paths) | Generated/refreshed via `pnpm gen-schema` against a live backend OpenAPI dump. Used to generate `src/lib/api/schema.ts` (**3,516 lines**) and the typed hooks in `src/hooks/hooks.ts` (**6,454 lines**). |

### 14.3 Environment variables (frontend)

None are committed in a checked-in example file (no `.env.example` was found at `frontend/`). The expected surface area, derived from `src/lib/firebase.ts` and `src/lib/openapi.ts`:

| Var | Used by | Notes |
|---|---|---|
| `VITE_BASE_URL` | `src/lib/openapi.ts`, `src/lib/api-client.ts`, `src/lib/api/hp-system.ts` | Backend root (e.g. `http://localhost:3141`). Default for non-prod is often `http://localhost:3141`. `hp-system.ts` appends `/hp`. |
| `VITE_FIREBASE_API_KEY` | `src/lib/firebase.ts` | Firebase web config. |
| `VITE_FIREBASE_AUTH_DOMAIN` | `src/lib/firebase.ts` | |
| `VITE_FIREBASE_PROJECT_ID` | `src/lib/firebase.ts` | |
| `VITE_FIREBASE_STORAGE_BUCKET` | `src/lib/firebase.ts` | |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `src/lib/firebase.ts` | |
| `VITE_FIREBASE_APP_ID` | `src/lib/firebase.ts` | |
| `VITE_FIREBASE_MEASUREMENT_ID` | `src/lib/firebase.ts` | Optional (analytics). |
| `VITE_USE_FIREBASE_EMULATOR` (boolean) | `src/lib/firebase.ts` | Connects to local Firebase Auth emulator. |
| `VITE_USE_MOCK_API` | `src/lib/api-client.ts` (legacy) | Legacy mock toggle — do not depend on. |

**No new `.env` should be touched without checking the gatekeeper convention in §6.**

### 14.4 Routing — dual system

There are **two** route definitions on disk. This looks like an in-progress (or stalled) React-Router → TanStack-Router migration.

| File | System | Status |
|---|---|---|
| `src/app/routes/router.tsx` | TanStack Router, **code-based** (NOT file-based) | **Active.** Imports many real pages, guards, layouts, and the `course-store`. |
| `src/app/routes/index.tsx` | React Router | Stale. Uses a `ProtectedRoute({role, children})` wrapper with student/teacher route lists. The `studentRoutes/learnRoutes` entries are placeholder `<div />` — these are NOT wired in production. |

If you add a new page, prefer extending `router.tsx`. Anything new in `index.tsx` should be migrated rather than growing.

#### Guards

- `ProtectedRoute` (React Router, in `index.tsx`) — wraps children, reads role from Zustand, checks `localStorage.token` for unauthenticated cases.
- `StudentRouteGuard` (top-level component `StudentRouteGuard.tsx`) — used by `router.tsx` to gate student-only routes; checks Firebase-auth ready state + role.

### 14.5 Auth flow (frontend ↔ backend)

1. **Sign-in:** `src/lib/firebase.ts` initialises the Firebase client using the seven `VITE_FIREBASE_*` env vars and exports helpers like `loginWithGoogle`, `loginWithEmail`, `auth`, `provider`.
2. **Token plumbing:** `src/utils/auth.ts` orchestrates `getIdToken()` → `GET /users/me` → maps to the app user shape via `mapFirebaseUserToAppUser()`, and stashes the ID token into the Zustand auth-store.
3. **Store:** `src/store/auth-store.ts` — Zustand `useAuthStore` with `persist` middleware; fields are `user, token, isAuthenticated, isAuthReady`; actions are `setUser, setToken, clearUser, hasRole, setAuthReady`. The token is read from `localStorage['firebase-auth-token']` on init.
4. **Context + auto-refresh:** `src/store/context/auth.tsx` — `AuthProvider` calls `setTokenRefreshFunction(refreshFirebaseToken)` on the OpenAPI client, subscribes to `onAuthStateChanged`, and schedules auto-refresh of the ID token roughly every ~50 minutes.
5. **Request middleware:** `src/lib/openapi.ts` — middleware injects `Authorization: Bearer <token>` on every request; on a 401 it invokes the registered refresh function exactly once, then retries the original request.

### 14.6 API clients — pick the right one

There is **intentional overlap** between several layers. The right choice depends on what you're building.

| Layer | Location | When to use | Notes |
|---|---|---|---|
| `openapi-fetch` typed client | `src/lib/openapi.ts` | Default for everything in `/api/*`. | Base URL: `VITE_BASE_URL`. `credentials: "include"`. Token-refresh slot registered by `AuthProvider`. |
| `openapi-react-query` generated hooks | `src/hooks/hooks.ts` (**6,454 lines**) | Default for reading/mutating `/api/*` from React. | Do not edit by hand. Regenerate with `pnpm gen-schema` (which re-fetches `openapi.json` and regenerates `src/lib/api/schema.ts` + `src/hooks/hooks.ts`). |
| Per-domain hand-written hooks | `src/hooks/{announcement-hooks,ejection-policy-hooks,system-notification-hooks}.ts`, `use-new-announcement-indicator.ts`, `use-emotion.ts`, `use-mobile.ts`, `useTranscriber.ts`, `useWorker.ts` | Used where the typed generation is intentionally bypassed. | Quality varies; some still use `apiClient` (legacy `fetch` wrapper), some use the openapi client. |
| Legacy `fetch` wrapper | `src/lib/api-client.ts` | **Avoid for new code.** | Reads `VITE_BASE_URL` directly; legacy clients still import it. |
| HP-System wrapper | `src/lib/api/hp-system.ts` (**798 lines**) | HP-System UI pages only. | Custom `fetch` wrapper, base `${VITE_BASE_URL}/hp`. Has a **`COHORT_ID_MAP`** workaround that maps cohort display names (Euclideans, Dijkstrians, Kruskalians, RSAians, AKSians, …) to real DB IDs. **Tech-debt flag** — see §14.9. |
| Axios hand-written (legacy) | `src/hooks/spaced-repetition.ts` (**127 lines**) | Spaced-repetition ONLY. | **Tech-debt flag — see §14.9.** |
| TanStack Query client config | `src/lib/client.ts` | Tuning (cache, retry, refetch). | `staleTime: 5 min`, `gcTime: 1 h`, `retry: 1`, `refetchOnWindowFocus: false`. |

**Decision rule:** for any new `/api/...` surface, use the generated `useXxx` hook from `hooks.ts`. Don't add a new hand-written hooks file unless the generated schema genuinely can't express the call.

### 14.7 Spaced-repetition (frontend) — important state

The backend is done (§12); the frontend has **only one** artifact today:

- `src/hooks/spaced-repetition.ts` — 127 lines, hand-written, uses `axios` (via `privateAxios`), defines types `ReviewItemResponse`, `CourseRetentionResponse`, `SeedScheduleBody`, `SubmitReviewBody`, `UpdateOptOutBody`, and methods `seed`, `review`, `getSchedule`, `getCourseRetention`. Field names are **snake_case** (`question_id`, `course_id`, `opt_out`, `review_quality`).

**This file's leading comment says "Auto-generated" but it is NOT.** It predates the OpenAPI unification. The types and field names **do not match** the live backend OpenAPI contract (which is camelCase, e.g. `questionId`, `courseId`).

What this means for the spaced-repetition MVP work:
- **Do not extend `spaced-repetition.ts`** — it's a dead-end.
- Delete it and replace with `useXxx` calls into `hooks.ts` (or regenerate the schema if the endpoints aren't present in `openapi.json`).
- **Pages do not exist yet:** there is no review-session screen and no retention dashboard page yet. They live only in the `feature-context.md` design.
- Backend endpoints to drive from UI: `POST /api/spaced-repetition/:studentId/seed`, `POST /api/spaced-repetition/:studentId/review` (body: `{questionId, quality: 0..5}`), `GET /api/spaced-repetition/:studentId/schedule`, `GET /api/spaced-repetition/:studentId/course/:courseId`, `PATCH /api/spaced-repetition/:studentId/notifications`.

### 14.8 State stores (`src/store/`)

| Store | Pattern | Purpose |
|---|---|---|
| `auth-store.ts` | Zustand `persist` | User, token, isAuthReady, hasRole helper. |
| `course-store.ts` | Zustand `persist` | `currentCourse`, `setWatchItemId`, `setQuestionId`, etc. |
| `anomaly-store.tsx` | Zustand | Anomaly state surfaced during proctoring (driven by `ai/Face*.tsx`). |
| `flag-store.tsx` | Zustand | Flag-modal state (open / payload) shared between teacher & student. |
| `player-store.ts` | Zustand | Watch-page player state. |
| `context/auth.tsx` | React context | Refresh-token registration + `onAuthStateChanged` subscription. |
| `context/hp-system.ts` | React context | HP-System shared state (cohort, current student, ledger cache). |

No Redux. No Recoil. Zustand is the only client-side state library in use.

### 14.9 Known tech debt & gotchas

- **`src/hooks/spaced-repetition.ts` is hand-written / axios / snake_case.** Does not match backend OpenAPI. Delete and rebuild via generated hooks. (§14.7)
- **`src/lib/api/hp-system.ts` hard-codes a `COHORT_ID_MAP`.** Until the real IDs are normalised at the source, the wrapper has to translate cohort names to IDs. Push back on the backend first; if not, add a comment so future-you knows why the map exists.
- **Dual-route system (`router.tsx` vs `index.tsx`).** Treat `index.tsx` as legacy; don't add net-new routes there. (§14.4)
- **`hooks.ts` is a generated file (~6.5k lines).** Don't hand-edit. If you change the backend contract, run `pnpm gen-schema` and commit the regenerated `openapi.json`, `lib/api/schema.ts`, and `hooks.ts` together.
- **`vite.config.ts` dev-proxy points at `http://localhost:4001`** but the backend runs on **3141**. Either `vite.config.ts` is stale (Backend was migrated from 4001 → 3141 and the proxy wasn't updated) or the proxy is on purpose for an alternate backend. Verify before relying on it.
- **No committed `.env.example` for the frontend.** All env surface is implicit in `src/lib/firebase.ts` and `src/lib/openapi.ts`. Anyone setting up locally has to read code, not config.
- **`shared/NotificationsPage.tsx` is 703 lines** and co-ordinates 4 separate hook families (`useInvites`, `useGetUnreadApprovedRegistrations`, `useGetPendingStudentRegistrations`, `useGetPendingRegistrations`, `useGetSystemNotifications`, `useMarkSystemNotificationAsRead`, `useMarkAllSystemNotificationsAsRead`, `useSubmitAppeal`) plus three modal components (`PolicyAcknowledgementModal`, `AppealModal`, `PolicyReacknowledgementModal`). Ideal refactor target once anything related is touched.
- **AI / proctoring stack is significant:** `src/components/ai/` contains `FaceDetectors.tsx`, `BlurDetector.tsx`, `FaceRecognitionOverlay.tsx` (87 lines), `FaceRegistrationModal.tsx` (**379 lines**), `GestureDetector.tsx`, `SpeechDetector.tsx`, `WhisperManager.tsx` (**1,316 lines**) and a `useCameraProcessor.ts` hook (140 lines). These run through `vite-plugin-comlink` workers in `src/workers/` (`whisperWorker.js`, `BlurDetectorWorker.ts`, `FaceDetectorWorker.ts`). The hot paths in `WhisperManager` are worth profiling separately before touching performance.

### 14.10 How to find your way around quickly

| If you want to… | Look here |
|---|---|
| Add a new page for students | `src/app/pages/student/` and wire it via `src/app/routes/router.tsx`. |
| Add a new page for teachers | `src/app/pages/teacher/` and wire it via `src/app/routes/router.tsx`. |
| Add a new `/api/...` UI call | Use the generated `useXxx` hook from `src/hooks/hooks.ts`. If missing, regenerate via `pnpm gen-schema` first. |
| Touch auth / token refresh | `src/lib/firebase.ts`, `src/utils/auth.ts`, `src/store/auth-store.ts`, `src/store/context/auth.tsx`, `src/lib/openapi.ts`. Read in that order. |
| Understand notifications UX | `src/app/pages/shared/NotificationsPage.tsx` (703 lines) + `src/components/NotificationDropdown.tsx` + `src/components/announcements/` + `src/hooks/system-notification-hooks.ts` + `src/hooks/announcement-hooks.ts`. |
| Touch HP-System (anonymised cohort gamification) | `src/lib/api/hp-system.ts` + `src/app/pages/teacher/hp-system/` + `src/app/pages/student/hp-system/` + `src/store/context/hp-system.ts`. |
| Touch proctoring / emotion / speech detection | `src/components/ai/`, `src/workers/`, plus backend `genAI` + `emotions` modules. The `VITE_USE_FIREBASE_EMULATOR` flag affects only Firebase auth, not AI. |
| Touch record-everywhere audio / video | `src/components/ai/WhisperManager.tsx` (1,316 lines), `src/workers/whisperWorker.js`, `src/components/floating-video.tsx`, `src/components/video.tsx`. |
| Touch spaced-repetition (UI) | §14.7 — start from the backend endpoints, regenerate schema if absent, then build pages. |

---

## 15. Workspace-wide context (CLI, docs site, e2e, CI, deploy)

Covers everything outside `backend/src/**` and `frontend/src/**` — the monorepo scaffolding and the things you touch when you change *where* something runs, *how* it's deployed, or *who* deploys it.

### 15.1 Monorepo layout (pnpm workspace)

`pnpm-workspace.yaml` lists seven packages:

| Path | What lives here | Real on disk? |
|---|---|---|
| `frontend/` | React + Vite app (§14) | ✅ |
| `backend/` | Express + Inversify service (§12) | ✅ |
| `docs/` | Docusaurus site (see §15.5) | ✅ |
| `cli/` | The `vibe` CLI (see §15.2) | ✅ |
| `e2e/` | Playwright tests (see §15.6) | ✅ |
| `backend/functions/` | Firebase Cloud Functions (named in workspace) | ❌ **Does not exist on disk** — stale entry; remove from `pnpm-workspace.yaml` if you take ownership of workspace hygiene. |
| `mcp/` | Reserved name (named in workspace) | ❌ **Does not exist on disk** — reserved for a Model-Context-Protocol server that hasn't landed. The path is excluded in `.gitignore` (`mcp/`). |

The root `package.json` declares: `pnpm@10.12.1` (per `packageManager` field), Husky + lint-staged (`prepare → husky`), and exposes two top-level commands: `pnpm binaries` (preloads mongo binary via `scripts/preload-mongo-binary.ts`) and `pnpm vibe` (runs `cli/src/cli.ts` via `pnpx ts-node`). `lint-staged` only lints `backend/**`.

### 15.2 The `vibe` CLI (`cli/`)

Commander-based, four commands:

| Command | What it does |
|---|---|
| `vibe setup` | Runs the welcome step, the Firebase-emulators step, and `env.ts` (writes a `.env` if missing). |
| `vibe start [backend\|frontend\|docs\|all\|auth\|functions\|emulators]` | Spawns dev servers via `pnpm run dev` per service; on Windows uses `shell: true`. No argument = backend + frontend. |
| `vibe test` | Runs the backend tests (delegates to `pnpm test:ci`). |
| `vibe help` | Prints the help table above. |

Wired via the root `package.json`'s `vibe` script: `pnpx ts-node cli/src/cli.ts`. Steps live in `cli/src/steps/`: `welcome.ts`, `firebase-emulators.ts`, `env.ts`, `firebase-login.ts` (commented out), `mongodb-binary.ts` (commented out). Steps run from `cli/src/steps/` cwd — keep new steps there.

### 15.3 Root setup scripts (`scripts/`)

- `setup-win.ps1` (PowerShell) and `setup-unix.sh` (Bash) are the **canonical one-command bootstrappers** for a fresh machine. They: clone the repo (if needed), install Node, install pnpm, run `pnpm install` + the `vibe` setup.
- `preload-mongo-binary.ts` warms up the MongoDB binary used by `mongodb-memory-server` for tests.
- `firebase-debug.log`, `setup.log` — runtime logs left behind by setup runs; both are committed (see §15.10).

### 15.4 Firebase hosting targets (`firebase.json`, `.firebaserc`)

Two hosting targets, both serving `frontend/dist` with catch-all rewrite to `/index.html`:

| Target | Firebase project | Hosted at |
|---|---|---|
| `staging` | `vibe-staging-63abb` | default in `.firebaserc` for `vibe-staging-63abb` project |
| `production` | `vibe-5b35a` | default project (`.firebaserc.projects.default`) |

`.firebaserc` lives at the repo root and is committed. Override locally with `firebase target:apply` or `firebase use --add`.

### 15.5 Docs site (`docs/`)

Docusaurus 3.7 with `@scalar/docusaurus`, `docusaurus-plugin-openapi-docs`, and `docusaurus-theme-openapi-docs` so the OpenAPI spec gets rendered into the docs site. The site builds by running `pnpm build` inside `docs/`, which first calls `pnpm copy` — that spins up a ts-node script that calls `backend/src/shared/functions/generateOpenApiSpec.ts` to dump `docs/static/openapi/openapi.json`. Deployed via `.github/workflows/deploy-docs.yml` to GitHub Pages.

### 15.6 Playwright E2E (`e2e/`)

- **Workspace package name:** `vibe-e2e`.
- **Single config:** `e2e/playwright.config.ts`. Notable: `timeout: 10h` (single worker, long full-traversal tests), `baseURL` → `BASE_URL || http://localhost:5173`, `permissions: ['camera', 'microphone']`, plus a stack of Chromium `--use-fake-device-for-media-stream` flags pointing at local `assets/webcam-face.y4m` / `.wav` for deterministic headless WebRTC.
- **Three test files** today: `smoke.spec.ts`, `play-course-vidoes.test.ts` (sic — keep that typo if you touch tests), `test-progress-status.test.ts`. Plus a shared `common-utils.ts`.
- **Test data lives in secrets**, not in repo. To run on staging use `INSTRUCTOR_EMAIL`, `INSTRUCTOR_PASSWORD`, `STUDENT_EMAIL`, `STUDENT_PASSWORD` env vars (see `nightly-staging-e2e.yml`).
- **No `global-setup`/`global-teardown`.** Tests run sequentially in a single worker to avoid shared-state interference.

### 15.7 CI workflows (`.github/workflows/`)

| File | Trigger | What it does |
|---|---|---|
| `linter.yml` | PR (`backend/**`) | `pnpm install` then `pnpm run lint` on `backend/`. |
| `labeler.yml` | PR open/reopen/sync | Auto-applies labels; marks PRs titled `Revert ...` with the `revert` label. |
| `jest-test.yml` | PR | **Mis-named:** runs `pnpm test:ci` which is `vitest run --coverage --reporter=html` (Vitest, not Jest). Whitelists the runner's IP in MongoDB Atlas, starts Firebase Auth emulator (`nohup ... &`), then tears down the IP allowlist at the end. Uses secrets: `ATLAS_PUBLIC_KEY`, `ATLAS_PRIVATE_KEY`, `ATLAS_PROJECT_ID`, `DB_URL`. |
| `deploy-backend-all.yml` | `workflow_dispatch` | Builds + pushes Docker image `vibe-backend:latest` and `:staging` to Docker Hub, optionally deploying to production (Cloud Run service `vibe-backend-staging`, region `asia-south1`). Required secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `APP_PORT`, plus GCP service-account JSON. |
| `deploy-frontend.yml` | `workflow_dispatch` | Lints, builds, then deploys `frontend/dist` to Firebase Hosting (`staging` + optional `production`). |
| `deploy-docs.yml` | push to `master`, or manual | Builds Docusaurus and deploys to GitHub Pages via `actions-gh-pages`. |
| `docs-check.yml` | PR or push touching `docs/**` | Lints + build-check for the Docusaurus site; doesn't deploy. |
| `nightly-staging-e2e.yml` | cron `30 20 * * *` (= 02:00 IST) | Installs Playwright browsers and runs `pnpm --dir e2e test-e2e` against `STAGING_FRONTEND_URL`. Uploads `playwright-report` artifact on every run. |

### 15.8 Key repository secrets (CI / deploy)

| Secret | Used by | Why |
|---|---|---|
| `ATLAS_PUBLIC_KEY`, `ATLAS_PRIVATE_KEY`, `ATLAS_PROJECT_ID` | `jest-test.yml` | MongoDB Atlas API to whitelist/unwhitelist runner IP. |
| `DB_URL` | `jest-test.yml` | Shared MongoDB instance tests connect to. |
| `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` | `deploy-backend-all.yml` | Push Docker image. |
| `APP_PORT` | `deploy-backend-all.yml` | Build-time `APP_PORT` arg. |
| `GCP_*` (service-account JSON) | `deploy-backend-all.yml` | Cloud Run deploy (region `asia-south1`, service `vibe-backend-staging`). |
| `STAGING_FRONTEND_URL`, `INSTRUCTOR_EMAIL`, `INSTRUCTOR_PASSWORD`, `STUDENT_EMAIL`, `STUDENT_PASSWORD` | `nightly-staging-e2e.yml` | E2E targets against the staging Firebase project. |

Local development does NOT need any of these — CI-only.

### 15.9 Where to look when something breaks

| Symptom | Look here first |
|---|---|
| "Port already in use" | `scripts/setup-*.sh/.ps1` + `cli/src/commands/start.ts` decide what runs; the `cli` is the canonical multi-service launcher. |
| "Schema out of sync" warning in frontend console | Regenerate via `pnpm gen-schema`; commit `frontend/openapi.json`, `src/lib/api/schema.ts`, `src/hooks/hooks.ts` together. The docs site does the same via `pnpm copy` (see §15.5). |
| CI `jest-test.yml` failing | Check `ATLAS_*` secrets; failures often come from Atlas rejecting the runner IP rather than test code. |
| Production deploy failing | Check `deploy-backend-all.yml` Docker build context (`./backend`, Dockerfile `./backend/Dockerfile`); GCP region is `asia-south1`. |
| Frontend dev proxy 404'ing `/api/...` | See §14.9 — `vite.config.ts` proxy points at `:4001` but the real backend is on `:3141`. Patch the proxy OR set `VITE_BASE_URL` and use the generated client's absolute URL. |
| E2E flaky on WebRTC | `playwright.config.ts` has the `--use-fake-device-for-media-stream` flags wired; if you add real-device E2E you'll need a real camera/mic in CI. |

### 15.10 Known repo hygiene issues

- **Committed logs at root:** `firebase-debug.log` and `setup.log`. Both are written by the setup scripts but `.gitignore` does not exclude them. Consider adding to `.gitignore`.
- **`backend/functions/` and `mcp/` listed in workspace but not on disk** — stale entries in `pnpm-workspace.yaml`.
- **`pnpm-workspace.yaml` lists 7 packages; only 5 exist on disk.** `pnpm install` should still work (missing entries are tolerated), but a fresh contributor will be confused.
- **`jest-test.yml` is mis-named** — runs Vitest. Either rename to `vitest-test.yml` or to `backend-tests.yml`.
- **Test name: `play-course-vidoes.test.ts`** (typo `vidoes`). Preserved for now in case tools rely on the filename.

---

*Last updated: 2026-07-04 (Step 4 cleanup pass complete).*
*Sections 1–11 sourced from the root `.md` files.* *Section 12 added after a first pass through the actual backend source (`backend/src/`, `backend/.example.env`, `backend/firebase.json`, `backend/package.json`, `backend/tsconfig.json`).* *Section 14 added after a first pass through the actual frontend source (`frontend/src/`, `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.*.json`, `frontend/firebase.json`, `frontend/Dockerfile`, `frontend/nginx.conf`, `frontend/openapi.json`).* *Section 15 added after a pass over the monorepo scaffolding (`cli/`, `docs/`, `e2e/`, `.github/workflows/`, `scripts/`, `pnpm-workspace.yaml`, root `package.json`, `.firebaserc`, `firebase.json`, `.gitignore`).* *Step 4 cleanups:* *Added Table of Contents after TL;DR.* *Fixed four `npm run` instances to `pnpm` in §6 and §9.* *Fixed `VITE_FIREBASE_Messaging_SENDER_ID` → `VITE_FIREBASE_MESSAGING_SENDER_ID` and added optional `VITE_FIREBASE_MEASUREMENT_ID` + emulator flag notes in §5.* *Added a `vibe` CLI quick-reference subsection to §4 and cross-linked §11 → §15.9.* *Replaced the §10 frontend-testing placeholder with what's actually in `frontend/package.json` (no test script today; recommended Vitest + `@testing-library/react` if/when added).* *Verified all internal `§N` cross-references resolve to existing sections.*
