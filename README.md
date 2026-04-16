# Notfy - Advanced Multi-Tenant Task & Notification Platform

Notfy is a powerful, offline-capable progressive web application (PWA) designed to manage tasks, dispatch cross-device alerts, and provide a seamless multi-tenant workflow for administrators and teams.

## Features Let Loose

* **True Offline Triggers**: Built with the experimental *Notification Triggers API*, Notfy schedules hardware-level alerts locally without needing constant internet connection, dropping reminders precisely when they're due!
* **Global Web Push Engine**: Features an automated hourly Node backend routine (Netlify Scheduled Functions) that blasts Standard Web Push updates to closed browsers and offline background instances using the VAPID architecture.
* **Granular Admin Link Ecosystem**: Allow independent team leaders to maintain discrete dashboards. Admins generate tokenized invite links, looping general users natively into their shared workflow scopes. 
* **Rich Text Editing**: Integrates beautiful document editing utilizing `react-quill`. Paint your tasks with proper structure, highlights, and headers.
* **Premium Asynchronous UX**: Deploys localized interface timeouts, gradient shading, and visual hierarchies for a buttery smooth experience utilizing React and Tailwind CSS.
* **Secure Deletion Methods**: Privacy matters. Contains simple triggers to securely dissolve MongoDB mappings, linked accounts, Firebase Auth footprints, and subscriptions anonymously.

## Tech Stack
* **Frontend**: React, Vite, Tailwind CSS, Date-fns, React-Quill, Lucide-Icons
* **Backend**: Netlify API Functions (Serverless), Netlify Built-in Background Cron
* **Database**: MongoDB
* **Authentication**: Firebase Auth (Google + Email)
* **Storage** (Optional Config): Firebase Storage *(for upcoming audio deployments)*

## Installation & Local Development

1. **Install Dependencies**:
```bash
npm install
```

2. **Configure Environment Secret Files** (`.env`):
* `VITE_FIREBASE_API_KEY` etc.
* `VITE_MONGODB_URI`
* `VAPID_PUBLIC_KEY` & `VAPID_PRIVATE_KEY`

3. **Start the Vite Engine**:
```bash
npm run dev
```

(Check `SETUP_AND_CONFIGURATION.md` for proper staging workflows regarding Netlify API variables and Push implementations).

---
Made By Ahmed Emad
