# Notfy - Netlify Deployment Guide

## What to Upload to Netlify

**Upload the ENTIRE "Notfy" project folder** - all files and subdirectories.

## Files That Must Be Included:

```
Notfy/
├── package.json          (Required - dependencies & build scripts)
├── package-lock.json     (Required - locked versions)
├── vite.config.ts        (Required - Vite configuration)
├── tsconfig.json         (Required - TypeScript config)
├── index.html            (Required - main HTML file)
├── src/                  (Required - all source code)
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   └── components/
│       └── AdminPanel.tsx
├── tailwind.config.js    (Required - Tailwind CSS)
├── postcss.config.js     (Required - PostCSS)
└── tsconfig.node.json    (Required - Node config)
```

## Netlify Deployment Steps:

1. **Upload to GitHub:**
   - Create a new repository on GitHub
   - Upload the entire Notfy folder
   - Commit and push all files

2. **Connect to Netlify:**
   - Sign up/login to Netlify
   - Click "New site from Git"
   - Connect your GitHub account
   - Select your Notfy repository

3. **Build Settings:**
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Click "Deploy site"

4. **Post-Deployment:**
   - Netlify will automatically build and deploy
   - Your site will be available at: `your-site-name.netlify.app`
   - Browser notifications will work when users grant permission

## Important Notes:
- Do NOT create a separate "netlify" folder
- Upload the complete project structure as-is
- All files are needed for the build process
- Netlify will handle the build and optimization automatically

The free Netlify tier provides:
- 100GB bandwidth per month
- 300 build minutes per month
- Automatic HTTPS
- Custom domain support
- Form handling
- Serverless functions