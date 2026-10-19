# Deploy

The dashboard runs on **Railway** (primary) with a **Redis** database in the
same Railway project. The old **Vercel** project can stay up as a backup: it
deploys the same GitHub repo. It only shares the admin settings if you give it
the Redis public URL (see `REDIS_URL` below).

Railway project: **ad-dashboard** (services `web` + `Redis`).
Railway URL: `https://commit-ad-dash.up.railway.app`

Every push to `main` on GitHub deploys to both Railway and Vercel.

---

## Environment variables

Set these on the Railway **web** service (Variables tab → Raw Editor is
fastest). On Vercel, the same names under Settings → Environment Variables.

**Global (all clients):**

| Key | Value |
|-----|-------|
| `DASHBOARD_AUTH_SECRET` | random 32-byte hex string (signs login cookies) |
| `ADMIN_PIN` | PIN for admin edit mode (renames, moves, filter, goals) |
| `META_ACCESS_TOKEN` | Meta system-user token (set to never expire) |
| `GOOGLE_DEVELOPER_TOKEN` | from ads.google.com/aw/apicenter |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | full JSON key of the service account that has access to the MCC |
| `GOOGLE_LOGIN_CUSTOMER_ID` | MCC account ID |
| `REDIS_URL` | Railway: `${{Redis.REDIS_URL}}` (already set, nothing to do). Vercel: optional, only if the Vercel backup should share admin settings: copy Railway → Redis → Variables → `REDIS_PUBLIC_URL`. Without it Vercel still works, it just can't save admin settings |

Optional: `GOOGLE_ADS_API_VERSION` (pin a version, e.g. `v25`, instead of
auto-detect), `RATE_LIMIT_GLOBAL_MAX` (total login attempts across all IPs per
15 min, default 60).

**Per client** (prefix from `lib/clients.ts`):

| Key | Value |
|-----|-------|
| `{PREFIX}_PASSWORD` | login password for `/{slug}` |
| `{PREFIX}_META_AD_ACCOUNT_ID` | Meta ad account, `act_123…` or just the number |
| `{PREFIX}_GOOGLE_CUSTOMER_ID` | 10-digit customer ID |
| `{PREFIX}_STACKADAPT_ADVERTISER_ID` | numeric advertiser ID. Required for StackAdapt to show (the key is account-wide) |
| `CAMELBACK_STACKADAPT_API_KEY` | StackAdapt account-wide key. Every client reuses it unless it has its own `{PREFIX}_STACKADAPT_API_KEY` |
| `{PREFIX}_VIEW_MODE` | optional default layout, `segment` or `channel` |
| `{PREFIX}_AD_FILTER` | optional default ad filter (see below) |

Every password, Meta account, Google customer ID and StackAdapt advertiser ID
must be unique per client. A duplicate makes the page error and login refuse
instead of mixing data.

Variables changed on Railway redeploy the service automatically. On Vercel,
redeploy after changing them.

---

## Adding a new client

1. Add an entry in `lib/clients.ts`:
   ```typescript
   {
     slug:        'newclient',          // lowercase letters, digits, dashes only
     name:        'New Client Name',
     envPrefix:   'NEWCLIENT',
     metaHandle:  '@newclienthandle',
     brandDomain: 'newclient.com',      // required
   }
   ```
2. Add `NEWCLIENT_PASSWORD`, `NEWCLIENT_META_AD_ACCOUNT_ID`,
   `NEWCLIENT_GOOGLE_CUSTOMER_ID` and `NEWCLIENT_STACKADAPT_ADVERTISER_ID` on
   Railway (and Vercel if it's still in use).
3. Push. `/newclient` goes live when the deploy finishes.

---

## Admin settings (shared, stored in Redis)

Unlock admin mode with the 🔒 in the footer. Everything you change there is
saved in Redis and shows for **every** viewer of that client within a minute:

- segment renames, colors, drag order
- moving an ad or a whole campaign to another segment, "+ New segment…"
- **View** button: by segment or by channel. `{PREFIX}_VIEW_MODE` is only the
  default until you pick one here.
- **Filter** button: show-only / hide terms (matched against ad name, campaign
  name and headline). Saved here it applies right away; "Reset to default"
  goes back to `{PREFIX}_AD_FILTER` / the code default. Env format:
  `meta: +Commit, -Awestruck | google: +Commit` (`+` show only, `-` hide,
  commas between terms, `|` between platforms, platform prefix optional).
- **Goals** (performance dots).

Settings an older version kept in your browser are copied to Redis the first
time you unlock on that browser.

If Redis is down the wall still loads (with the last settings it saw) but
admin changes can't be saved until it's back.

---

## Custom domain

To serve `dash.commitagency.com` from Railway: Railway → web → Settings →
Networking → Custom Domain, enter the domain, then update the DNS record it
shows (CNAME) wherever commitagency.com's DNS is managed. Remove the domain
from Vercel after the switch so the two don't fight over it.

---

## Data refresh

Each client's platform data is fetched at most once per ~55 seconds and shared
by every open screen (`lib/server-cache.ts`). Open walls soft-refresh every 60
seconds while the tab is visible. Login cookies renew on every visit, so an
always-on screen stays logged in.
