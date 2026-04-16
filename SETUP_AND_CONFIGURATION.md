# RelaySignal Complete Configuration & Setup Guide

This document outlines every environmental variable and external service setting that needs to be configured for the full RelaySignal feature-set to work in production.

## 1. Do I Need to Add Secrets to GitHub?
**NO.** You do not need to add any keys or secrets to your GitHub repository or GitHub Actions.
Since you are deploying on Netlify directly from GitHub, Netlify simply copies your code. You will put all of your secrets exclusively inside your **Netlify Dashboard -> Site configuration -> Environment variables**. 

## 2. VAPID Keys for Web Push Notifications
For the Netlify Cron Job to deliver the offline/background notifications to Service Workers, you must provide VAPID keys. You do not get these from a website; you generate them locally through a library.

1. Open your terminal inside this project folder in VS Code.
2. Run this exact command: `npx web-push generate-vapid-keys`
3. The terminal will spit out a **Public Key** and a **Private Key**. 
4. Copy those strings and add them to your Netlify Environment Variables:
   - `VAPID_PUBLIC_KEY`: (Paste the generated Public Key)
   - `VAPID_PRIVATE_KEY`: (Paste the generated Private Key)
   - `VAPID_SUBJECT`: `mailto:your-email@example.com` (Just put your real email address here)

## 2. Cloudinary Media Storage (Images & Media)
We use Cloudinary because it provides a generous 25GB free tier without requiring a credit card, unlike Firebase.

1. Create a free account at [Cloudinary.com](https://cloudinary.com).
2. Note your **Cloud Name** displayed on your dashboard.
3. Go to **Settings > Upload > Upload Presets**.
4. Click **"Add upload preset"**, set the "Signing Mode" to **"Unsigned"**, and give it a convenient name (e.g., `notfy_uploads`).
5. Add the following two variables to your Netlify Environment Variables:
   - `VITE_CLOUDINARY_CLOUD_NAME=your_cloud_name`
   - `VITE_CLOUDINARY_UPLOAD_PRESET=notfy_uploads`
6. *(Optional)* For local testing, add these same variables to your local `.env` file.

## 3. Telegram Bot Integrations
We route instantaneous alarms to your personal Telegram devices. You must manually create the Bot as follows:

1. Open Telegram and message `@BotFather`. Use the command `/newbot`.
2. Grab the HTTP API Token it provides.
3. Make sure to put your exact Bot Username inside `src/App.tsx` where we have hardcoded `YOUR_BOT_USERNAME`.
4. Add `TELEGRAM_BOT_TOKEN` to your **Netlify Dashboard Environment Variables**.
5. Once your application is fully deployed and the URL is live, run the setup script:
   `node scripts/registerTelegramWebhook.mjs`
   It will ask you for your Bot Token and Live Netlify URL to instantly lock Telegram's database into your webhook endpoints!

## 4. MongoDB Database
Your app is configured to store all Tasks, Subscriptions, and Users inside MongoDB. You will need a cloud database cluster (MongoDB Atlas provides a free 512MB tier).

**Step-by-Step Atlas Setup:**
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and create an account.
2. Build a Database (Choose the **M0 Free Shared** tier).
3. **Database Access**: Create a new database user. Give them a Username and Password. (Save this password somewhere safe).
4. **Network Access**: Go to Network Access on the left sidebar. Click *Add IP Address*, and select *ALLOW ACCESS FROM ANYWHERE* `0.0.0.0/0`. This is strictly required so that Netlify's rotating serverless IP addresses can connect to your database.
5. Go back to Databases, click **Connect**, select **Drivers** (Node.js).
6. Copy the provided connection string. It will look like this:
   `mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
7. Replace `<password>` in the string with the actual password you made in step 3.
8. Add this exact connection string string to your Netlify Environment Variables as:
   `VITE_MONGODB_URI`

## 5. Netlify Scheduled Functions (Cron)
We built an hourly cron job to check for tasks and process background pushes. No code changes are required from you, but you need to know how it triggers.

1. Netlify automatically reads the `netlify.toml` file where we deployed: `[functions."cron-push"] schedule = "@hourly"`.
2. When deploying to Netlify, it will recognize this Cron instruction automatically. No further dashboard configuration is required for this component.

## 6. Firebase Client Config (Critical — For Login to Work!)
This is what allows the **Google and Email login** to function on the frontend. Without these, you will get the `auth/auth-domain-config-required` error.

1. Go to [Firebase Console](https://console.firebase.google.com) and select your project.
2. Click the ⚙️ **Settings gear** → **Project Settings**.
3. Scroll down to **"Your apps"**. If no web app exists, click **"Add app"** and choose the `</>` (Web) icon.
5. Copy each value and add it to your `.env` file locally AND to your **Netlify Dashboard → Environment Variables**:
   - `VITE_FIREBASE_API_KEY` = the `apiKey` value
   - `VITE_FIREBASE_AUTH_DOMAIN` = the `authDomain` value
   - `VITE_FIREBASE_PROJECT_ID` = the `projectId` value *(example: `my-app-12345`) — this is also used by the backend*
   - `VITE_FIREBASE_STORAGE_BUCKET` = the `storageBucket` value
   - `VITE_FIREBASE_MESSAGING_SENDER_ID` = the `messagingSenderId` value
   - `VITE_FIREBASE_APP_ID` = the `appId` value
5. Also enable **Google sign-in**: Go to **Authentication → Sign-in method → Google → Enable**.

## 7. Firebase Admin Service Account (For Backend Auth)
The Netlify serverless functions (`api.ts`) verify that incoming requests are from real Firebase users. For this, they need a **Service Account** private key — a secret JSON file that your backend uses to securely communicate with Firebase. It is never exposed to users.

**How to get your Project ID:**
Your `VITE_FIREBASE_PROJECT_ID` is visible in multiple places in Firebase Console. The easiest: look at the URL when you are on your Firebase project page — it is the slug after `/project/`. For example: `https://console.firebase.google.com/project/MY-PROJECT-ID/overview` → your ID is `MY-PROJECT-ID`.

**How to generate the Service Account JSON:**
1. In [Firebase Console](https://console.firebase.google.com), select your project.
2. Click ⚙️ **Settings gear** → **Project Settings**.
3. Click the **"Service accounts"** tab at the top of the page.
4. Click **"Generate new private key"** → **"Generate key"** in the confirmation dialog.
5. Firebase auto-downloads a `.json` file. Open it — it will look like:
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN RSA PRIVATE KEY-----\n...",
  "client_email": "firebase-adminsdk@your-project.iam.gserviceaccount.com"
}
```
6. Copy the **entire contents** of the JSON file (select all → copy).
7. In your **Netlify Dashboard → Environment Variables**, add a new variable:
   - **Key:** `FIREBASE_SERVICE_ACCOUNT`
   - **Value:** Paste the full JSON as-is (Netlify handles multi-line values)

> ⚠️ **Never commit this JSON to GitHub!** It is a sensitive secret key. Only store it in Netlify's Environment Variables. Your `.gitignore` already excludes `.env` so you are protected locally.

## 8. Android & Mobile Browser Stability (CRITICAL)
Modern mobile browsers (like Chrome on Android) often block "Third-Party Storage," which can cause a login loop if your app is on Netlify and your login is on Firebase. To fix this, we implement a **First-Party Auth Proxy**.

**Step 1: Authorized Domains (Firebase Console)**
1. Go to [Firebase Console](https://console.firebase.google.com) -> **Authentication** -> **Settings**.
2. Click the **"Authorized domains"** tab.
3. Click **"Add domain"** and add: `relaysignal.netlify.app`.

**Step 2: Authorized Redirect URIs (Google Cloud Console)**
1. Go to the [Google Cloud Console Credentials Page](https://console.cloud.google.com/apis/credentials).
2. Ensure your project (`relaysignal-88d8c`) is selected at the top.
3. Under **OAuth 2.0 Client IDs**, click the **Pencil icon (Edit)** for your **Web Client**.
4. Scroll to **"Authorized redirect URIs"**.
5. Click **"ADD URI"** and paste exactly:
   `https://relaysignal.netlify.app/__/auth/handler`
6. Click **SAVE** at the bottom.

> [!IMPORTANT]
> Google Cloud settings can take up to **10 minutes** to propagate. If you get a `redirect_uri_mismatch` error immediately after saving, wait a few minutes and try again.
