# Deploy to Vercel — Step by Step

## What you need first
- A free GitHub account (github.com)
- A free Vercel account (vercel.com) — sign up with GitHub

---

## Step 1 — Create a GitHub repo

1. Go to github.com → click **New repository**
2. Name it `ad-dashboard` (or anything)
3. Set it to **Private**
4. Click **Create repository**

---

## Step 2 — Push this folder to GitHub

Open Terminal, navigate to this folder, and run:

```bash
cd "path/to/ad-dashboard"
git init
git add .
git commit -m "initial"
git remote add origin https://github.com/YOUR_USERNAME/ad-dashboard.git
git push -u origin main
```

---

## Step 3 — Deploy on Vercel

1. Go to vercel.com → **Add New Project**
2. Import your `ad-dashboard` GitHub repo
3. Vercel auto-detects Next.js — just click **Deploy**

---

## Step 4 — Add environment variables

After deploy, go to:
**Vercel → Your Project → Settings → Environment Variables**

Add each key from `.env.example`:

| Key | Value |
|-----|-------|
| `DASHBOARD_PASSWORD` | whatever password you want |
| `META_ACCESS_TOKEN` | your Meta long-lived token |
| `META_AD_ACCOUNT_ID` | e.g. `act_123456789` |
| `GOOGLE_DEVELOPER_TOKEN` | from ads.google.com/aw/apicenter |
| `GOOGLE_CLIENT_ID` | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | OAuth refresh token |
| `GOOGLE_CUSTOMER_ID` | 10-digit, no dashes |
| `GOOGLE_LOGIN_CUSTOMER_ID` | MCC ID if applicable |
| `STACKADAPT_API_KEY` | from StackAdapt → Settings → API |

After adding variables → **Redeploy** (Deployments → ⋯ → Redeploy)

---

## Step 5 — Done

Your dashboard URL: `https://ad-dashboard-xyz.vercel.app`

Share that link + the password you set. Anyone with the password can log in.
No account needed on their end.

---

## To refresh data

Just reload the page — it fetches live from all three APIs on every load.

## To update the code

Push a new commit to GitHub → Vercel auto-redeploys in ~30 seconds.
