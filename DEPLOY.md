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
| `DASHBOARD_AUTH_SECRET` | random 32-byte hex string |
| `ADMIN_PIN` | numeric PIN for segment renames |
| `CAMELBACK_PASSWORD` | whatever password you want |
| `CAMELBACK_META_ACCESS_TOKEN` | your Meta long-lived token |
| `CAMELBACK_META_AD_ACCOUNT_ID` | e.g. `act_123456789` |
| `CAMELBACK_GOOGLE_DEVELOPER_TOKEN` | from ads.google.com/aw/apicenter |
| `CAMELBACK_GOOGLE_CLIENT_ID` | OAuth client ID |
| `CAMELBACK_GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `CAMELBACK_GOOGLE_REFRESH_TOKEN` | OAuth refresh token |
| `CAMELBACK_GOOGLE_CUSTOMER_ID` | 10-digit, no dashes |
| `CAMELBACK_GOOGLE_LOGIN_CUSTOMER_ID` | MCC ID if applicable |
| `CAMELBACK_STACKADAPT_API_KEY` | from StackAdapt → Settings → API |

After adding variables → **Redeploy** (Deployments → ⋯ → Redeploy)

---

## Step 4b — Migrating from single-client to multi-client (existing installations only)

If you already have this dashboard running with the old env var names, rename them in Vercel:

| Old key | New key |
|---------|---------|
| `DASHBOARD_PASSWORD` | `CAMELBACK_PASSWORD` |
| `META_ACCESS_TOKEN` | `CAMELBACK_META_ACCESS_TOKEN` |
| `META_AD_ACCOUNT_ID` | `CAMELBACK_META_AD_ACCOUNT_ID` |
| `GOOGLE_DEVELOPER_TOKEN` | `CAMELBACK_GOOGLE_DEVELOPER_TOKEN` |
| `GOOGLE_CLIENT_ID` | `CAMELBACK_GOOGLE_CLIENT_ID` |
| `GOOGLE_CLIENT_SECRET` | `CAMELBACK_GOOGLE_CLIENT_SECRET` |
| `GOOGLE_REFRESH_TOKEN` | `CAMELBACK_GOOGLE_REFRESH_TOKEN` |
| `GOOGLE_CUSTOMER_ID` | `CAMELBACK_GOOGLE_CUSTOMER_ID` |
| `GOOGLE_LOGIN_CUSTOMER_ID` | `CAMELBACK_GOOGLE_LOGIN_CUSTOMER_ID` |
| `STACKADAPT_API_KEY` | `CAMELBACK_STACKADAPT_API_KEY` |
| `ADMIN_PIN` | `ADMIN_PIN` (unchanged) |
| `DASHBOARD_AUTH_SECRET` | `DASHBOARD_AUTH_SECRET` (unchanged) |

After renaming, redeploy. Your dashboard will now be at `/camelback` instead of `/`.

## Step 4c — Adding a new client

1. Open `lib/clients.ts` and add an entry:
   ```typescript
   {
     slug:       'newclient',
     name:       'New Client Name',
     envPrefix:  'NEWCLIENT',
     metaHandle: '@newclienthandle',
   }
   ```
2. Add the `NEWCLIENT_*` env vars to Vercel (same set as the `CAMELBACK_*` vars above, with `NEWCLIENT_` prefix).
3. Push and deploy. The dashboard at `/newclient` goes live immediately.

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
