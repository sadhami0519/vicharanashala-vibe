# Prompt — Step 11: Review Reminder Email Notifications

## 1. Goal

Wire up real email delivery for the spaced repetition review reminder. Replace the
`[ReviewReminder]` log stub in `NotificationService.notifyReviewReminder()` with a
live `MailService.sendMail()` call. Students receive an actual email (not just an
in-app notification) when their review session is due.

---

## 2. What Already Exists

### Infrastructure (already built — do NOT modify)

| File | Role |
|------|------|
| `backend/src/modules/notifications/services/MailService.ts` | `sendMail(options)` — nodemailer wrapper; currently a stub returning `true` |
| `backend/src/modules/notifications/services/InviteService.ts` | `createInviteEmailMessage()` — full HTML+text email builder for course invites; reference pattern |
| `backend/src/modules/notifications/services/NotificationService.ts` | `notifyReviewReminder()` — already creates in-app notification; has `[ReviewReminder]` log stub |
| `backend/src/modules/notifications/types.ts` | `NOTIFICATIONS_TYPES.MailService` — DI symbol |
| `backend/src/modules/notifications/container.ts` | `MailService` bound to `NOTIFICATIONS_TYPES.MailService` — already wired |
| `backend/src/config/smtp.ts` | Reads `SMTP_USER` + `SMTP_PASS` env vars |
| `backend/src/modules/notifications/classes/transformers/Invite.ts` | `createInviteEmailMessage()` output type — nodemailer `SendMailOptions` |

### The Existing Pattern to Follow

`InviteService.createInviteEmailMessage()` is the reference implementation:
- Takes a domain object (invite, course, courseVersion)
- Returns `Omit<nodemailer.SendMailOptions, 'from'>`
- Builds both `text` (plain) and `html` (HTML email template)
- The `from` field is set once in `MailService.sendMail()`

### What We Have for Students

- `studentId` (string) — the student's user ID
- `courseIds` (string[]) — course IDs with due items
- `dueCount` (number) — total items due
- `UserRepository.findById(studentId)` → returns `IUser` with `.email` field
- `CourseRepository.read(courseId)` → returns `ICourse` with `.name` field

---

## 3. Files to Modify

### `backend/src/modules/notifications/services/MailService.ts`

**Change:** Uncomment and complete the real `sendMail()` implementation.

The method is currently stubbed:
```typescript
async sendMail(options): Promise<...> {
  // const mailOptions = { from: smtpConfig.auth.user, ...options };
  // const info = await this.transporter.sendMail(mailOptions);
  return true;
}
```

Uncomment the real implementation. Keep the `return true` (or return `info` if you want to log it).

**Why this file:** This is where all email sending is centralised.

---

### `backend/src/modules/notifications/classes/transformers/ReviewReminderEmail.ts` *(new file)*

**Change:** Create this new transformer class with a `createReviewReminderEmailMessage()`
method. Mirror the `InviteService.createInviteEmailMessage()` pattern exactly.

Signature:
```typescript
createReviewReminderEmailMessage(params: {
  studentEmail: string;
  studentName?: string;       // from User.name, optional
  dueCount: number;
  courseNames: string[];      // first 3 resolved course names
  totalCourseCount: number;   // total courses with due items
  ctaUrl?: string;            // deep link to review screen, optional
}): Omit<nodemailer.SendMailOptions, 'from'>
```

Returns both `text` (plain text version) and `html` (HTML email) — same dual-version
pattern as `InviteService`.

**Content ideas for the email:**
- Subject: "📝 Time to review — [X] questions waiting"
- Body: "You have [X] questions due for review across [N] courses: [Course A], [Course B]..."
- CTA button: "Start Review Session" linking to the review dashboard
- Footer: "You're receiving this because you opted into spaced repetition reminders. Manage preferences in your profile."
- Unsubscribe hint (opt-out already exists; just mention it)

**Why a new file:** Keeps the email template transformer co-located with other notification
transformers (`Invite.ts`). This is an add-only change — no existing file is modified
for the template.

---

### `backend/src/modules/notifications/services/NotificationService.ts`

**Change:** In `notifyReviewReminder()`, replace the `console.log('[ReviewReminder] ...')`
stub with a real email send.

The method already has everything it needs — `studentId`, `courseIds`, `dueCount`. You
need to:

1. Resolve student email: `const student = await this.userRepo.findById(studentId)`
2. Resolve course names: reuse the existing `Promise.allSettled(courseNameResults)` logic
3. Call `createReviewReminderEmailMessage({ studentEmail, dueCount, courseNames, ... })`
4. Call `await this.mailService.sendMail(emailMessage)` wrapped in try/catch
5. Keep the `console.log(...)` as a fallback when email fails (so we always have a log)

```typescript
// Replace the TODO block with:
try {
  const student = await this.userRepo.findById(studentId);
  if (!student?.email) {
    console.warn(`[ReviewReminder] No email found for student ${studentId}`);
    return;
  }
  const emailMessage = createReviewReminderEmailMessage({
    studentEmail: student.email,
    dueCount,
    courseNames: displayNames,
    totalCourseCount: courseCount,
  });
  await this.mailService.sendMail(emailMessage);
} catch (err) {
  console.warn(`[ReviewReminder] Email send failed for student ${studentId}:`, err);
  // In-app notification already created above — do not re-throw
}
```

**Note:** `NotificationService` already has `UserRepository` injected. Check the existing
constructor to confirm. If not, add `@inject(GLOBAL_TYPES.UserRepo)`.

**Why this file:** This is where `notifyReviewReminder()` lives — all changes to call
`MailService` go here.

---

### `backend/.env.example`

**Change:** Add the SMTP configuration section so new developers know what to set:

```dotenv
# Email (SMTP) — used for course invites and spaced repetition reminders
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password   # Gmail: use App Password, not login password
```

---

### `backend/src/modules/spacedRepetition/tests/` *(new test file)*

**File:** `ReviewReminderEmail.test.ts` in `backend/src/modules/spacedRepetition/tests/`

**Change:** Create unit tests for the `createReviewReminderEmailMessage()` transformer.

Test cases:
1. Renders correct subject line with due count
2. Renders `dueCount = 1` vs `dueCount > 1` (singular/plural)
3. Renders course list — first 3 named courses shown
4. Renders "and N more" when there are more than 3 courses
5. Falls back to course IDs when course name is unavailable
6. HTML version contains the CTA button
7. `ctaUrl` is included in the email when provided
8. `ctaUrl` is omitted cleanly when not provided

---

## 4. Files to NOT Modify

- `backend/src/modules/notifications/services/InviteService.ts` — do not touch
- `backend/src/modules/notifications/classes/transformers/Invite.ts` — do not touch
- `backend/src/modules/notifications/container.ts` — DI wiring is already correct
- `backend/src/config/smtp.ts` — config is fine as-is; just add env vars to `.env.example`
- `backend/src/modules/spacedRepetition/services/SpacedRepetitionService.ts` — no changes needed
- `backend/src/modules/spacedRepetition/cron/reviewNotificationJob.ts` — no changes needed

---

## 5. Constraints

- **Auth:** The `MailService` uses Gmail SMTP (service: 'gmail'). App Password required.
  The `sendMail` method must set `from: smtpConfig.auth.user` on every email.
- **Fail-open:** If the email send fails, log a warning but **do not throw**. The in-app
  notification has already been created — email failure must never undo that.
- **Privacy:** Never log student email addresses. Log `studentId` and course count only.
- **Review URL:** The frontend review dashboard URL is not yet built. Pass `ctaUrl` as
  `undefined` or a placeholder (`#`). Do not link to a non-existent URL.
- **No new env vars** beyond `SMTP_USER` and `SMTP_PASS` — everything else already exists.

---

## 6. DI and Import Paths

```typescript
// In NotificationService — already injected:
@inject(GLOBAL_TYPES.UserRepo)
private readonly userRepo: UserRepository,

// MailService — already injected:
@inject(NOTIFICATIONS_TYPES.MailService)
private readonly mailService: MailService,

// Import the new transformer:
import {ReviewReminderEmail} from '../classes/transformers/ReviewReminderEmail.js';
// Or if simpler — keep the builder inline in NotificationService
```

Import aliases to use:
- `#root/shared/database/providers/mongo/repositories/UserRepository.js`
- `#root/modules/notifications/classes/transformers/ReviewReminderEmail.js`

---

## 7. Acceptance Criteria

| # | Criterion | How to verify |
|---|-----------|--------------|
| 1 | `MailService.sendMail()` makes a real nodemailer call | Code inspection — stub is uncommented |
| 2 | `createReviewReminderEmailMessage()` returns correct `SendMailOptions` | New unit tests pass |
| 3 | `notifyReviewReminder()` sends email with correct subject + body | Integration: check server logs on next cron run |
| 4 | Email failure does not break the in-app notification flow | Try/catch wraps `mailService.sendMail()` — in-app notification created first |
| 5 | `SMTP_USER` / `SMTP_PASS` documented in `.env.example` | File content check |
| 6 | No existing tests broken | `pnpm test:ci` passes |

---

## 8. Order of Implementation

```
1. MailService.ts          — uncomment sendMail(), return real SentMessageInfo
2. ReviewReminderEmail.ts  — create transformer class with builder method
3. NotificationService.ts  — wire email send into notifyReviewReminder()
4. .env.example            — add SMTP_USER / SMTP_PASS section
5. ReviewReminderEmail.test.ts — write unit tests for the transformer
6. Run tests               — pnpm test:ci, should be 32+ passing
7. TypeScript check        — npx tsc --noEmit, zero errors
```

---

## 9. After This Step

- `feature-context.md` — mark email delivery (Step 11) as ✅ complete
- `feature-user-flow-backend.md` — update "email" row to show ✅
- `vibe_local_setup_guide.md` — add note under backend config about `SMTP_USER` / `SMTP_PASS`