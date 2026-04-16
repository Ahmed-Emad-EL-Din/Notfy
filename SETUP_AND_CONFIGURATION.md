# RelaySignal Complete Configuration & Setup Guide

This document outlines every environmental variable and external service setting that needs to be configured for the full RelaySignal feature-set to work in production.

## 1. VAPID Keys for Web Push Notifications
For the Netlify Cron Job to deliver the offline/background notifications to Service Workers, you must provide VAPID keys.

1. Open your terminal in this project and run: `npx web-push generate-vapid-keys`
2. It will output a Public Key and a Private Key. 
3. Go to your **Netlify Project Dashboard -> Site configuration -> Environment variables** and add the following three variables:
   - `VAPID_PUBLIC_KEY`: (Paste the generated Public Key)
   - `VAPID_PRIVATE_KEY`: (Paste the generated Private Key)
   - `VAPID_SUBJECT`: `mailto:your-email@example.com` (Just put your real email address here)

## 2. Firebase Storage (For Voice Notes)
To allow tasks to save Voice Note audio recordings you need a place to put them. Firebase Storage gives a generous 5GB for free limits.

1. Go to your [Firebase Console](https://console.firebase.google.com/).
2. Select your RelaySignal project.
3. On the left sidebar, click **Storage** (Under "Build").
4. Click **Get Started** and step through the initial prompts (Default region is fine).
5. Once your storage bucket is created, click the **Rules** tab at the top of the Storage page.
6. Replace the default rules with the following to allow logged-in users to save audio files:
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
       allow read, write: if request.auth != null;
    }
  }
}
```
7. Click **Publish**.

*Note: In the current `TaskEditor.tsx` code, the audio recording script is mocked (left as a stub). Once your storage is set up, the raw React Firebase Storage hooks can be safely attached.*

## 3. MongoDB Database
Your app is already configured for Auth and Tasks, but please ensure your MongoDB connection is rock solid.

1. Ensure the `VITE_MONGODB_URI` environment variable is strictly populated accurately on your **Netlify Dashboard**.
2. Netlify Functions rely exclusively on this URI to do everything from Account Deletion to creating Administrator Invites.

## 4. Netlify Scheduled Functions (Cron)
We built an hourly cron job to check for tasks and process background pushes. No code changes are required from you, but you need to know how it triggers.

1. Netlify automatically reads the `netlify.toml` file where we deployed: `[functions."cron-push"] schedule = "@hourly"`.
2. When deploying to Netlify, it will recognize this Cron instruction automatically. No further dashboard configuration is required for this component.

## 5. Firebase Admin Key (For Backend Auth)
When users click an Invite Link, the backend `api.ts` parses their Firebase token to verify they are legitimate before adding them to the database.

1. Ensure `VITE_FIREBASE_PROJECT_ID` is defined in Netlify Env variables.
2. Ensure you have the `FIREBASE_SERVICE_ACCOUNT` (or your equivalent JSON credentials) in Netlify so `firebase-admin` works properly to decode these tokens without rejecting API calls!
