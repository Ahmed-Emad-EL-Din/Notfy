# Active Context: RelaySignal / Notfy

## Current Work Focus
Recently completed a major feature batch including:
1. **Web Push deduplication fix** — prevents spam by tracking `last_push_sent_at`
2. **Priority Levels** — tasks now support `low/medium/high/urgent` with filtering and badges
3. **Backend schema extensions** — added subtasks, labels, comments, assignment, reminder offsets, and templates (API actions ready)

## Recent Changes (Latest Commit: 1bc3d60)
- `netlify/functions/cron-push.ts`: Tightened query window to 1h, added `last_push_sent_at` dedup
- `netlify/functions/api.ts`: Added `priority` to Zod schema; added `subtasks`, `labels`, `comments`, `assigned_to`, `reminder_offset_minutes` fields; added `addComment`, `saveTemplate`, `getTemplates`, `deleteTemplate` actions
- `src/App.tsx`: Priority filter, priority badges, dark mode state, label filter state, expanded Task interface
- `src/components/TaskEditor.tsx`: Priority dropdown, subtasks checklist, labels/tags input, assign-to dropdown, reminder offset selector
- `FEATURE_CATALOG.md`: Documented push dedup and priority levels

## Next Steps
- Implement frontend UI for new backend fields (subtasks, labels, comments, assignment, templates)
- Add duplicate task, draft autosave, dark mode, inline preview (quick wins)
- Add calendar/kanban view and bulk actions
- Implement offline task creation queue via service worker

## Active Decisions
- All new fields are additive with sensible defaults to avoid migration issues
- MongoDB collections: `tasks`, `users`, `notifications`, `push_subscriptions`, `user_links`, `invites`, `audit_logs`, `task_activity`, `templates`
- Cron runs hourly; dedup window is ~55 minutes to prevent duplicate pushes

## Learnings
- Netlify Scheduled Functions require `@netlify/functions` schedule wrapper
- Service Worker push events work for closed-browser notifications on Android Chrome and Desktop
- iOS Safari push support is limited and requires PWA add-to-homescreen
