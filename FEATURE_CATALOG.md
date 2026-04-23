# RelaySignal / Notfy Feature Catalog

This file is the source of truth for product capabilities implemented in this codebase.
Use it during refactors and PR reviews to make sure features are preserved.

## How To Use This File

- Before changing code, scan the relevant section and verify you are not removing behavior.
- After adding or changing behavior, update this file in the same PR.
- If a feature is deprecated, do not delete it from this file; move it to "Deprecated / Replaced" with reason.

## 1) Authentication and Session

### 1.1 Email and Password Auth
- Sign up and sign in with Firebase Authentication.
- Signup supports role choice (`user` or `admin`).
- Friendly auth error mapping for common Firebase errors.
- Password confirmation validation on signup.

### 1.2 Google Auth (Redirect Flow)
- Login with Google using redirect flow (`signInWithRedirect`).
- Redirect result handling (`getRedirectResult`) on app load.
- Local flag tracking for redirect-in-progress to avoid bad loading transitions.

### 1.3 Session Persistence
- Firebase local persistence is enabled.
- Existing sessions restore automatically on refresh/restart.
- Local development fallback auto-login (localhost only) when not manually signed out.

## 2) Roles, Permissions, and Workspace Model

### 2.1 Role Types
- Owner: task creator.
- Admin: full admin user.
- Co-admin: linked elevated collaborator.
- Member: linked regular user.

### 2.2 Permission Matrix (Enforced in Backend)
- Edit task: owner/admin/co-admin.
- Delete task: owner/admin/co-admin.
- React/vote: users with task access only.
- Poll management changes are guarded by elevated roles.

### 2.3 Multi-Tenant Workspace Linking
- Admin generates invite links.
- Users join workspace via `/invite/:token`.
- Supports `user` and `co-admin` invite roles.
- User can unlink from admin workspace.
- Admin can view linked users.

## 3) Task Management Core

### 3.1 CRUD
- Create task.
- Update task.
- Delete task.
- Toggle completion.

### 3.2 Task Fields
- Title.
- Rich HTML description.
- Due date/time.
- Visibility (`personal` or `global`).
- Group name.
- Task type (`standard` or `poll`).
- Priority (`low`, `medium`, `high`, `urgent`). Defaults to `medium`.

### 3.3 Priority Levels
- Tasks can be assigned a priority level.
- Priority is visible as a colored badge on task cards (High = orange, Urgent = red).
- Tasks can be filtered by priority in the task list.
- Priority is editable in the Task Editor.

### 3.3 Global Task Propagation
- Admin global tasks are visible to linked users.
- Global task creation can trigger linked-user alerts.

## 4) Rich Content and Attachments

### 4.1 Rich Text
- `react-quill` editor for formatted descriptions.
- Image embed support.

### 4.2 Voice Notes
- In-browser recording via MediaRecorder.
- Cloud upload and playback.

### 4.3 Attachment Panel
- Multiple attachments per task.
- Attachment metadata stored with task:
  - URL
  - Name
  - MIME type
  - Size
- File validation:
  - Max size: 10MB.
  - Allowed types: PDF, PNG, JPG, WEBP, TXT.
- Safe preview/download links (`target="_blank"` and `rel="noreferrer"`).

## 5) Polls, Reactions, and Collaboration

### 5.1 Poll Tasks
- Tasks can be marked as poll type.
- Multiple options with client validation.
- One vote per user (enforced by replacing previous vote).
- Anonymous vote option.
- Optional result visibility.

### 5.2 Emoji Reactions
- Reaction toggling per emoji.
- Per-emoji reaction counts.

## 6) Recurring Tasks and Scheduling Controls

### 6.1 Recurrence Rules
- Supported frequencies: daily, weekly, monthly.
- Interval support (bounded numeric interval).

### 6.2 Completion Auto-Next
- Completing a recurring task creates the next occurrence.

### 6.3 Snooze and Skip
- Snooze endpoint updates due date forward (current UI action: 30 minutes).
- Skip occurrence endpoint advances recurring task to next scheduled date.

## 7) Notifications Center

### 7.1 Persisted Notifications
- Notification history stored in MongoDB.
- Notifications linked to user and optional task.
- Read/unread state persisted.

### 7.2 Notification Actions
- Fetch notifications (`all`, `info`, `warning`, `urgent`).
- Mark read/unread for individual notifications.
- Mark all notifications read.

### 7.3 UI Behaviors
- Notification list with severity styling.
- Unread count display.
- Type filter and refresh control.

## 8) Reminders and Delivery Channels

### 8.1 Browser Notifications
- Permission request flow.
- In-app scheduling for due reminders.
- Offline trigger support where available.

### 8.2 Web Push
- Push subscription registration via service worker.
- Subscription upsert in backend.
- Scheduled push processing via Netlify cron job.
- Expired subscription cleanup.
- Deduplication: tasks only receive one push per ~55-minute window via `last_push_sent_at` tracking.

### 8.3 Telegram
- Telegram bot linking flow.
- Webhook registration endpoint.
- Link status polling/check endpoint.
- Test notification endpoint.
- Disconnect endpoint.
- Webhook handler for `/start` deep-linking.

## 9) Search, Filters, and Sorting

### 9.1 Search
- Full task-list search by:
  - Title
  - Description content

### 9.2 Filters
- Status: all / pending / completed.
- Type: all / standard / poll.
- Notification type filter in notifications center.

### 9.3 Sort
- Due soonest.
- Newest.

## 10) Activity Timeline and Auditability

### 10.1 Task Activity Timeline
- Per-task activity stream collection.
- Logged actions include:
  - created
  - updated
  - reacted
  - voted
  - snoozed
  - skipped occurrence

### 10.2 Audit Logs
- Backend audit log collection for high-value actions.
- Includes actor, action, entity, entity id, metadata, timestamp.
- Admin-only endpoint to read audit logs.

## 11) Security and Data Protection

### 11.1 Input Validation
- Runtime schema validation using `zod` for task payloads and nested fields.

### 11.2 HTML Sanitization
- Rich description HTML sanitized server-side (`sanitize-html`) before persistence.

### 11.3 Rate Limiting
- In-memory per-IP/per-action request limiter in API function.

### 11.4 Auth Verification
- Firebase Admin token verification for API access.
- Local debug token shortcut only for local development host.

## 12) Admin and Team Operations

### 12.1 Admin Panel
- Linked users directory.
- Invite generation tools.
- Notification dispatch form UI.

### 12.2 Invite System
- Role-based invite token generation.
- Invite reuse behavior for existing admin-role pair.

## 13) Account and Data Lifecycle

### 13.1 Account Deletion
- Removes user record.
- Removes owned tasks.
- Removes push subscriptions.
- Removes workspace invites and links.
- Attempts Firebase Auth user deletion.

### 13.2 Notification Preferences
- Per-task mute/unmute list persisted on user profile.

## 14) Operational Features

### 14.1 Netlify Serverless API
- Single action-based API handler supporting CRUD and integrations.

### 14.2 Scheduled Jobs
- Hourly cron function checks upcoming tasks and dispatches reminders.

### 14.3 CORS / Local Dev Support
- API handles preflight and permissive local CORS behavior.

## 15) Do-Not-Remove Checklist (Release Gate)

Before merging any major refactor, verify:

- [ ] Email + Google auth still works.
- [ ] Task CRUD + completion still works.
- [ ] Poll voting and reactions still work.
- [ ] Recurring + snooze + skip still work.
- [ ] Attachments upload and render still work.
- [ ] Notifications center persists read/unread state.
- [ ] Role restrictions are still enforced server-side.
- [ ] Task activity timeline still records events.
- [ ] Audit logs still record admin-sensitive changes.
- [ ] Rate limiting + sanitization + schema validation still run.
- [ ] Telegram and web push flows still function.

## 16) Deprecated / Replaced

Keep historical notes here when behavior changes, instead of removing records from this document.

## 17) Requested Feature Lock List (Detailed)

Status legend:
- `Implemented`: exists in current app behavior.
- `Partial`: exists with limitations; improve in next iteration.
- `Planned`: not implemented yet.

### 17.1 Platform and Core UX
- **Website can send browser notifications even when website is closed** -> `Implemented` (Web Push via service worker + backend push).
- **Scheduled notification when user is offline** -> `Implemented` (offline trigger support where browser supports Notification Triggers; plus backend scheduled push).
- **Login as user or admin using Google or email** -> `Implemented`.
- **Professional UI** -> `Implemented` (modern responsive UI, loading states, inline feedback); subjective design quality can still be refined.
- **Mobile-friendly responsive UI** -> `Implemented` (responsive header/actions, adaptive task and notification cards, mobile-safe editor and action layout).
- **User can delete account** -> `Implemented`.
- **Footer text "Made By: Ahmed Emad"** -> `Implemented`.
- **Task description rich formatting (font styles, size via headers, highlight/colors, links)** -> `Implemented` through rich text editor.
- **Sort task newest appears first** -> `Implemented` (newest is available and is now default in task sorting controls).

### 17.2 User Capabilities
- **User gets notifications and schedule for admin-created tasks** -> `Implemented`.
- **User links to admin through admin invite link** -> `Implemented`.
- **User can mute/unmute specific notifications/tasks** -> `Implemented` (per-task mute toggle).
- **User can unlink from a specific admin** -> `Implemented`.
- **User can link to multiple admins, each separate** -> `Implemented` at data model level (`user_links` per admin relationship).
- **User can create personal tasks (only user gets notification)** -> `Implemented`.
- **User can react to admin task** -> `Implemented`.
- **User can react to notification** -> `Planned`.
- **User can vote and choose anonymous mode** -> `Implemented`.
- **User can rearrange group ordering per-user without changing admin grouping** -> `Planned`.

### 17.3 Admin Capabilities
- **Admin can generate link to onboard users** -> `Implemented`.
- **Admin can send voice note in task description/context** -> `Implemented` (voice note attachment per task).
- **Voice notes retained for at least 1 year** -> `Partial` (depends on Cloudinary/storage retention policy; app currently does not enforce retention policy in code).
- **Admin can create votes and choose whether results are visible to users** -> `Implemented`.
- **Admin can create named task groups** -> `Implemented`.
- **Admin can edit/remove tasks** -> `Implemented`.
- **Admin can mark task global or personal** -> `Implemented`.
- **Admin can see number and names of linked users** -> `Implemented`.
- **Admin can generate link for other admins with separated visibility from personal tasks** -> `Partial` (co-admin links exist; fine-grained per-task admin scope/personal visibility guarantees need stricter policy layer).

### 17.4 Security and Governance
- **Rate limiting on serverless actions** -> `Implemented`.
- **Description HTML sanitization** -> `Implemented`.
- **Strict payload validation schema** -> `Implemented` (`zod`).
- **Audit log for admin-relevant actions** -> `Implemented`.
- **Task activity timeline for teams** -> `Implemented`.

## 18) Recent UI Responsiveness Improvements

- Header now wraps actions cleanly on small screens and keeps user controls accessible.
- Main layout spacing and panel padding are optimized for mobile and desktop breakpoints.
- Task editor is mobile-safe:
  - toolbar wraps on narrow screens
  - attachments section stacks correctly
  - save/cancel controls become full-width on mobile
- Task cards adapt for small screens:
  - compact typography and spacing
  - actions wrap instead of clipping
  - description, attachments, recurrence, and timeline spacing are improved for readability.
