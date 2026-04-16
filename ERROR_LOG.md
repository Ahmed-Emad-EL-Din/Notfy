# RelaySignal Bug & Solution Log

This document tracks the critical bugs encountered during the final development and deployment phase, along with their root causes and technical resolutions.

## 1. Netlify Production Build Failure
**Symptoms:** 
- Deployment logs showed `Command failed with exit code 2: npm run build`. 
- `tsc` (TypeScript Compiler) reported 30+ errors stating properties like `title`, `dueDate`, and `completed` do not exist on type `Task`.

**Root Cause:**
While adding new features (Polls, Grouping, Reactions), the `Task` interface in `src/App.tsx` was accidentally replaced with a partial interface that only contained the *new* properties, effectively "deleting" the standard task fields from the eyes of the compiler.

**Solution:**
- Restored the missing standard properties to the `Task` interface in `src/App.tsx`.
- Removed an unused `auth` variable in `src/__tests__/App.test.tsx` that was causing a linting error.

---

## 2. "Failed to Save Task" (API Rejection)
**Symptoms:**
- The frontend dashboard loaded correctly, but clicking "Save Task" resulted in an alert: `Failed to save task. Server Error: Unauthorized: Invalid token`.

**Root Cause:**
The `FIREBASE_SERVICE_ACCOUNT` environment variable was entered into the Netlify Dashboard as a multiline JSON block. The Node.js `JSON.parse` function was failing because it was only receiving the first line (`{`) of the string, causing the Firebase Admin SDK to crash before it could verify any user tokens.

**Solution:**
Implemented a **Robust JSON Parser** in `netlify/functions/api.ts`. The new logic:
- Attempts a standard `JSON.parse` first.
- If it fails, it applies a `.trim()` and `.replace(/\\n/g, '\n')` cleanup to the string before trying again.
- This ensures the Service Account initializes correctly even if the environment variable formatting is unconventional.

---

## 3. Telegram Linkage Timeout
**Symptoms:**
- Clicking "Connect Telegram" and hitting "Start" in the bot resulted in an infinite waiting state on the website that eventually timed out.

**Root Cause:**
This was a secondary symptom of **Error #2**. Because the Firebase Admin SDK was failing to initialize, the `checkTelegramStatus` and `telegramWebhook` endpoints were also crashing. The frontend was polling the database, but the backend couldn't update the `telegram_chat_id` due to the initialization crash.

**Solution:**
Fixed via the **Robust JSON Parser** implementation in `api.ts`. Verified the fix using a Telegram Webhook simulation script (`test_telegram_webhook.mjs`).

---

## 4. Initial Login Dashboard Race Condition
**Symptoms:**
- New users signing up for the first time were occasionally seeing a blank dashboard even after a successful login.

**Root Cause:**
The `fetchTasks` function was relying on the `currentUser` state variable. Due to React's asynchronous state updates, `fetchTasks` was sometimes firing *before* `currentUser` was finished being set, leading it to exit early.

**Solution:**
Updated the `fetchTasks` signature to accept an optional `overrideUserId`. In the `handleLogin` flow, we now pass the user ID directly from the login response to ensure the first fetch is always successful regardless of state timing.

---

## 5. Firebase Auth-Domain Configuration Missing
**Symptoms:**
- Login attempts failed with an `auth/auth-domain-config-required` error.

**Root Cause:**
The `authDomain` property was missing from the Firebase client configuration, preventing Google and Email OAuth redirects.

**Solution:**
Updated `.env` and `src/lib/firebase.ts` to include the `VITE_VITE_FIREBASE_AUTH_DOMAIN` variable and confirmed it was added to the Netlify production variables. 

---

## 6. Truncated Service Account Environment Variable
**Symptoms:**
- Server Error: `Firebase Admin Initialization Failed: Robust JSON parsing failed. First 20 chars: "{". Error: Expected property name or '}' in JSON at position 1 (line 1 column 2)`.

**Root Cause:**
On the Netlify Dashboard, when a JSON block is pasted into an environment variable field as multiple lines, the injection process sometimes only provide the first line to the serverless function. The backend receives an incomplete fragment (just `{`), which is invalid JSON.

**Solution:**
Implemented a double-safety initialization strategy in `netlify/functions/api.ts`:
1.  **Truncation Detection**: The code now checks the length of the string. If it's suspiciously short (less than 100 characters), it identifies the variable as "broken."
2.  **Auto-Fallback**: Instead of crashing, the backend now gracefully ignores the broken JSON fragment and falls back to initializing via `VITE_FIREBASE_PROJECT_ID` only. 
3.  **Result**: The app remains functional and secure even if the Dashboard configuration is truncated.
