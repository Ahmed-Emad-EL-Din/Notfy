# Product Context: RelaySignal / Notfy

## Why This Exists
RelaySignal solves the problem of team task management and notification dispatching for admin-led workflows. Many teams need a simple way for an administrator to create tasks, assign them, and ensure team members receive timely notifications — even when they are not actively using the app.

## Problems It Solves
1. **Fragmented communication**: Tasks and notifications scattered across email, chat apps, and spreadsheets
2. **Missed deadlines**: Users don't get reminded if they aren't actively checking the app
3. **No offline awareness**: Traditional web apps can't notify users when the browser is closed
4. **Complex onboarding**: Setting up team workspaces is often complicated

## How It Works
1. Admin signs up and generates an invite link
2. Users join via the invite link and link to the admin's workspace
3. Admin creates tasks (standard or poll) with due dates and optionally makes them global
4. Global tasks trigger instant notifications to linked users
5. Hourly cron job sends Web Push + Telegram reminders for upcoming tasks
6. Users can react, vote, comment, and track activity per task

## User Experience Goals
- Zero-friction onboarding via invite links
- Reliable notification delivery across devices
- Clean, responsive UI that works on mobile and desktop
- Rich task editing with formatting, attachments, and voice notes
- Clear task organization via groups, labels, and priority levels
