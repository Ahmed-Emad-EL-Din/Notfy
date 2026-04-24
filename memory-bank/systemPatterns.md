# System Patterns: RelaySignal / Notfy

## Architecture Overview
```
Frontend (React + Vite + Tailwind)
  ├── Service Worker (push + offline triggers)
  └── API Client ──► Netlify Functions (serverless)
                         ├── MongoDB (data)
                         ├── Firebase Admin (auth)
                         └── Web Push / Telegram (notifications)
```

## Design Patterns
- **Single Action-Based API**: One Netlify function (`api.ts`) handles all CRUD via `action` query param
- **Role-Based Permissions**: `getUserRoleContext()` determines owner/admin/co-admin/member/none
- **Rate Limiting**: In-memory per-IP store with 240 req/min window
- **Schema Validation**: Zod for runtime payload validation on all task mutations
- **HTML Sanitization**: `sanitize-html` server-side before persisting rich descriptions
- **Audit Logging**: All admin-sensitive actions written to `audit_logs` collection
- **Activity Timeline**: Per-task activity stream in `task_activity` collection

## Key Component Relationships
- `App.tsx` is the root; manages auth state, tasks, notifications, and filters
- `TaskEditor.tsx` handles create/edit with rich text, polls, recurrence, attachments
- `AdminPanel.tsx` shows linked users and invite generation tools
- `Auth.tsx` handles Firebase login/signup with Google redirect flow
- Service worker (`sw.js`) handles push events and notification clicks

## Critical Implementation Paths
1. **Auth Flow**: Firebase onAuthStateChanged → `handleLogin()` → upsert user → fetch tasks/notifications
2. **Task Creation**: TaskEditor → `addTask` API → Zod validation → MongoDB insert → instant push if global
3. **Reminder Delivery**: Netlify cron (`cron-push.ts`) → query upcoming tasks → send Web Push + Telegram → update `last_push_sent_at`
4. **Invite Flow**: Admin generates token → user visits `/invite/:token` → `joinAdmin` API → create `user_links`

## Data Flow
- Tasks are fetched once on login; local state updates optimistically after mutations
- Notifications are fetched on login and can be refreshed manually
- Push subscriptions are registered automatically on successful login
