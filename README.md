# Notfy - Browser Notification System

A React-based notification system that sends browser notifications for tasks and events, even when the browser is closed.

## Features

- ✅ Task management with due dates
- ✅ Automatic browser notifications for tasks due tomorrow
- ✅ Admin panel for sending notifications to users
- ✅ Responsive design with Tailwind CSS
- ✅ TypeScript for type safety
- ✅ Browser notification support

## Tech Stack

- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS (styling)
- Lucide React (icons)
- date-fns (date utilities)

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

3. Open http://localhost:5173/

## Deployment to Netlify

1. Push this repository to GitHub
2. Connect your GitHub repo to Netlify
3. Set build command: `npm run build`
4. Set publish directory: `dist`
5. Deploy!

## Browser Notifications

The app uses the browser's Notification API. Users will be prompted to allow notifications when they first use the app. Notifications will work even when the browser is closed (if permission is granted).

## Admin Features

- Toggle admin mode in the admin panel
- Send notifications to all users
- Support for different notification types (info, warning, urgent)