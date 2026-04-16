# RelaySignal Bug & Solution Log

This document tracks the critical bugs encountered during the final development and deployment phase, along with their root causes and technical resolutions.

## 1. Netlify Production Build Failure
**Symptoms:** 
- Deployment logs showed `Command failed with exit code 2: npm run build`. 
- `tsc` reported property missing errors on `Task` interface.
**Solution:** Restored missing properties to `Task` interface in `src/App.tsx`.

## 2. API "Unauthorized: Invalid token"
**Symptoms:** "Failed to save task" alert on production.
**Root Cause:** Multiline JSON parsing issues in the environment variables.
**Solution:** Implemented robust JSON parsing in `netlify/functions/api.ts`.

## 3. Telegram Linkage Timeout
**Symptoms:** Infinite loading when connecting to bot.
**Solution:** Fixed backend initialization crash (Error #2) and verified webhook logic.

## 4. Initial Login Dashboard Race Condition
**Symptoms:** Blank dashboard on first login.
**Solution:** Passed `overrideUserId` to `fetchTasks` in the login flow.

## 5. Firebase Auth-Domain Configuration Missing
**Symptoms:** `auth/auth-domain-config-required` error.
**Solution:** Added `VITE_FIREBASE_AUTH_DOMAIN` to client config and Netlify.

## 6. Truncated Service Account Variable
**Symptoms:** `app/no-app` error and JSON syntax error at position 1.
**Solution:** Added truncation detection and auto-fallback to `VITE_FIREBASE_PROJECT_ID` initialization.

## 7. Hanging Telegram Redirect
**Symptoms:** Clicking "Connect Telegram" took a long time to open or hung on a web redirect.
**Root Cause:** `t.me` redirects rely on browser protocols that can be slow or fail on some devices.
**Solution:** Updated `App.tsx` to use the **`tg://` direct protocol** for instant app launching, with a 1-second `t.me` fallback for web clients.
