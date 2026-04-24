# Tech Context: RelaySignal / Notfy

## Technology Stack
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, date-fns
- **Rich Text**: React-Quill with Cloudinary image upload
- **Icons**: Lucide-React
- **Backend**: Netlify Functions (serverless), Node.js runtime
- **Database**: MongoDB (via native driver)
- **Auth**: Firebase Authentication (Email/Password + Google OAuth)
- **Push Notifications**: Web Push API with VAPID, service worker
- **File Uploads**: Cloudinary (images, audio, attachments)
- **Scheduling**: Netlify Scheduled Functions (`@hourly` cron)

## Development Setup
1. `npm install`
2. Configure `.env` with Firebase, MongoDB, VAPID, and Cloudinary keys
3. `npm run dev` starts Vite dev server

## Key Dependencies
- `firebase` / `firebase-admin` — Auth
- `mongodb` — Database driver
- `web-push` — Server-side push delivery
- `zod` — Runtime schema validation
- `sanitize-html` — HTML sanitization
- `react-quill` — Rich text editor
- `@netlify/functions` — Serverless function types

## Environment Variables
| Variable | Purpose |
|----------|---------|
| `VITE_FIREBASE_API_KEY` | Firebase client config |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Admin SDK JSON |
| `VITE_MONGODB_URI` | MongoDB connection string |
| `VAPID_PUBLIC_KEY` | Web Push public key |
| `VAPID_PRIVATE_KEY` | Web Push private key |
| `VAPID_SUBJECT` | Web Push subject (mailto:) |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token |
| `VITE_CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | Cloudinary unsigned upload preset |

## Constraints
- Netlify Functions have a 10s execution limit (suitable for API, not long processing)
- Netlify Scheduled Functions require paid plan or explicit enablement
- Service Worker push requires HTTPS in production
- MongoDB free tier has connection limits (connection pooling via cached client)
