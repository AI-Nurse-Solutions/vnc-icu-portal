# VNC ICU Vacation Request Portal — Deployment Guide

## Code is ready at:
**GitHub:** https://github.com/AI-Nurse-Solutions/vnc-icu-portal (private)

---

## Option A: Deploy to Railway (Recommended — Easiest)

### Step 1: Login to Railway
1. Go to [railway.app](https://railway.app) and sign in with your GitHub account

### Step 2: Create a New Project
1. Click **"New Project"**
2. Select **"Deploy from GitHub Repo"**
3. Select **AI-Nurse-Solutions/vnc-icu-portal**
4. Railway will auto-detect the Procfile and start building

### Step 3: Add a PostgreSQL Database
1. In your project dashboard, click **"+ New"** → **"Database"** → **"Add PostgreSQL"**
2. Railway auto-injects `DATABASE_URL` into your service

### Step 4: Set Environment Variables
Click on the web service → **"Variables"** tab → Add these:

```
NODE_ENV=production
SESSION_SECRET=<generate a long random string — e.g. run: openssl rand -hex 32>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your-gmail-app-password
SMTP_FROM=VNC ICU Portal <your-gmail@gmail.com>
```

> **Gmail App Password:** Go to https://myaccount.google.com/apppasswords to generate one.
> If you don't have SMTP set up yet, the app will still work — OTP codes will be printed in the server logs.

### Step 5: Run Migrations
Railway will auto-run migrations via the `release` command in the Procfile.
If that didn't happen, you can run manually:
1. Click on your service → **"Settings"** → find **"Railway CLI"**
2. Or use the Railway shell: `railway run npm run migrate`
3. To seed demo data: `railway run npm run seed`

### Step 6: Generate a Domain
1. Click on the web service → **"Settings"** → **"Generate Domain"**
2. You'll get a URL like: `vnc-icu-portal-production.up.railway.app`

---

## Option B: Deploy to Render

### Step 1: Login to Render
1. Go to [render.com](https://render.com) and sign in with GitHub

### Step 2: Use Blueprint (Automatic)
1. Go to [dashboard.render.com/blueprints](https://dashboard.render.com/blueprints)
2. Click **"New Blueprint Instance"**
3. Select the **AI-Nurse-Solutions/vnc-icu-portal** repo
4. Render reads `render.yaml` and creates both the web service and PostgreSQL database
5. Set the environment variables when prompted:
   - `SESSION_SECRET` — a long random string
   - `SMTP_HOST` = smtp.gmail.com
   - `SMTP_PORT` = 587
   - `SMTP_USER` = your Gmail
   - `SMTP_PASS` = your Gmail app password
   - `SMTP_FROM` = VNC ICU Portal <your-gmail@gmail.com>

### Step 3: Done
Render auto-deploys, runs migrations, and gives you a `.onrender.com` URL.

---

## Option C: Deploy via Railway CLI (from Terminal)

If you prefer using the terminal, open a regular Terminal (not this Claude session):

```bash
cd ~/VNCICUCODE

# Login to Railway
railway login

# Create a new project
railway init

# Add PostgreSQL
railway add --plugin postgresql

# Set environment variables
railway variables set NODE_ENV=production
railway variables set SESSION_SECRET=$(openssl rand -hex 32)
# ... set SMTP variables too

# Deploy
railway up

# Run migrations
railway run npm run migrate

# Seed demo data (optional)
railway run npm run seed

# Get your URL
railway domain
```

---

## Post-Deploy Checklist

- [ ] Visit the URL and verify the login page loads
- [ ] Log in with admin account: `admin@vncicu.dev` / `password123`
  - (Only works if you ran `npm run seed` — otherwise create users via CSV import)
- [ ] Check the calendar page loads with demand visualization
- [ ] Submit a test vacation request
- [ ] Verify the Review page works for managers
- [ ] Test the Admin panel (config, blackouts, deadlines)
- [ ] Set up real Gmail SMTP for OTP delivery
- [ ] Change the admin password in production!

---

## Default Seed Users (if `npm run seed` was run)

| Email | Password | Role |
|-------|----------|------|
| admin@vncicu.dev | password123 | Admin |
| manager.am@vncicu.dev | password123 | Manager (AM shift) |
| manager.pm@vncicu.dev | password123 | Manager (PM shift) |
| employee1@vncicu.dev | password123 | Employee |

> ⚠️ **Change all passwords after initial setup!**
