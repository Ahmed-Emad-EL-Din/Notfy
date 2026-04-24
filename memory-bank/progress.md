# Progress: RelaySignal / Notfy

## What Works
- [x] Email + Password authentication with role selection
- [x] Google OAuth redirect flow
- [x] Session persistence and auto-login on refresh
- [x] Admin invite link generation and user onboarding
- [x] Task CRUD with rich text descriptions
- [x] Poll tasks with anonymous voting
- [x] Emoji reactions on tasks
- [x] Recurring tasks (daily/weekly/monthly)
- [x] Snooze and skip occurrence
- [x] Voice notes and file attachments (PDF, images, TXT)
- [x] Notification center with read/unread state
- [x] Web Push registration and delivery via service worker
- [x] Telegram bot linking and notifications
- [x] Search, filters (status, type, priority), and sort
- [x] Task activity timeline
- [x] Audit logs for admin actions
- [x] Rate limiting and HTML sanitization
- [x] Web Push deduplication (no spam)
- [x] Priority levels with badges and filtering

## What's Left to Build
- [ ] Subtasks / Checklists UI (backend ready)
- [ ] Labels / Tags UI (backend ready)
- [ ] Comments on tasks UI (backend ready)
- [ ] Task assignment UI (backend ready)
- [ ] Custom reminder offsets UI (backend ready)
- [ ] Task templates UI (backend ready)
- [ ] Duplicate task button
- [ ] Draft autosave in TaskEditor
- [ ] Dark mode toggle
- [ ] Inline file preview (images, PDFs)
- [ ] Bulk actions (multi-select complete/delete/move)
- [ ] Calendar view / Kanban board
- [ ] Offline task creation queue

## Current Status
Backend schema and API actions are extended and ready. Frontend UI components need to be updated to expose the new fields and features.

## Known Issues
- iOS Safari push notification support is limited
- Netlify cron requires explicit scheduled function enablement
- `addComment` API uses `$push` with `$slice` which may need type casting in TypeScript
