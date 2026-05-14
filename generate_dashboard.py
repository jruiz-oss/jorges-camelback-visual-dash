#!/usr/bin/env python3
"""
Ad Visual Dashboard Generator
==============================
Fetches active/paused ads from Meta, Google Ads, and StackAdapt
and generates a self-contained visual dashboard.html.

SETUP:
  1. pip install requests
  2. Fill in your credentials in the CONFIG block below
  3. Run: python generate_dashboard.py
  4. dashboard.html opens automatically in your browser

Re-run anytime to refresh.
"""

import json
import os
import sys
import subprocess
import platform
import requests
from datetime import datetime
from pathlib import Path

# ============================================================
#  CREDENTIALS — fill these in before running
# ============================================================
CONFIG = {
    "meta": {
        "enabled": True,
        "access_token": "YOUR_META_ACCESS_TOKEN",
        # Long-lived page/system user token. Get from:
        # developers.facebook.com → Graph API Explorer
        "ad_account_id": "act_XXXXXXXXX",
        # Format: act_ followed by your account ID (e.g. act_123456789)
    },
    "google_ads": {
        "enabled": True,
        "developer_token": "YOUR_DEVELOPER_TOKEN",
        # From: ads.google.com/aw/apicenter
        "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
        "client_secret": "YOUR_CLIENT_SECRET",
        # OAuth credentials from console.cloud.google.com
        "refresh_token": "YOUR_REFRESH_TOKEN",
        # Generate via OAuth playground or google-auth-oauthlib
        "customer_id": "1234567890",
        # 10-digit account ID, no dashes
        "login_customer_id": "",
        # MCC account ID if applicable, otherwise leave blank
    },
    "stackadapt": {
        "enabled": True,
        "api_key": "YOUR_STACKADAPT_API_KEY",
        # From: app.stackadapt.com → Settings → API
    },
}

OUTPUT_FILE = Path(__file__).parent / "dashboard.html"


# ============================================================
#  META ADS
# ============================================================
def fetch_meta_ads():
    cfg = CONFIG["meta"]
    if not cfg["enabled"]:
        return []

    print("→ Fetching Meta Ads...")
    token = cfg["access_token"]
    account = cfg["ad_account_id"]

    url = f"https://graph.facebook.com/v19.0/{account}/ads"
    params = {
        "access_token": token,
        "fields": "id,name,status,effective_status,creative{thumbnail_url,image_url,title,body,name}",
        "filtering": '[{"field":"effective_status","operator":"IN","value":["ACTIVE","PAUSED"]}]',
        "limit": 200,
    }

    ads = []
    try:
        while url:
            resp = requests.get(url, params=params, timeout=20)
            resp.raise_for_status()
            data = resp.json()

            if "error" in data:
                print(f"  ⚠  Meta error: {data['error'].get('message', data['error'])}")
                break

            for ad in data.get("data", []):
                creative = ad.get("creative") or {}
                image_url = creative.get("thumbnail_url") or creative.get("image_url") or ""
                status = ad.get("effective_status") or ad.get("status") or "UNKNOWN"
                ads.append({
                    "id": ad.get("id", ""),
                    "name": ad.get("name") or "Unnamed Ad",
                    "status": status.upper(),
                    "image_url": image_url,
                    "headline": creative.get("title") or creative.get("name") or "",
                    "body": creative.get("body") or "",
                    "campaign": "",
                })

            # Pagination
            next_url = data.get("paging", {}).get("next")
            url = next_url
            params = {}  # Already encoded in next_url

    except Exception as e:
        print(f"  ✗  Meta fetch failed: {e}")

    print(f"  ✓  {len(ads)} Meta ads")
    return ads


# ============================================================
#  GOOGLE ADS
# ============================================================
def _google_access_token():
    cfg = CONFIG["google_ads"]
    resp = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": cfg["client_id"],
            "client_secret": cfg["client_secret"],
            "refresh_token": cfg["refresh_token"],
            "grant_type": "refresh_token",
        },
        timeout=20,
    )
    resp.raise_for_status()
    token_data = resp.json()
    if "access_token" not in token_data:
        raise ValueError(f"Token error: {token_data.get('error_description', token_data)}")
    return token_data["access_token"]


def fetch_google_ads():
    cfg = CONFIG["google_ads"]
    if not cfg["enabled"]:
        return []

    print("→ Fetching Google Ads...")
    try:
        access_token = _google_access_token()
    except Exception as e:
        print(f"  ✗  Google auth failed: {e}")
        return []

    customer_id = cfg["customer_id"].replace("-", "")
    headers = {
        "Authorization": f"Bearer {access_token}",
        "developer-token": cfg["developer_token"],
        "Content-Type": "application/json",
    }
    if cfg.get("login_customer_id"):
        headers["login-customer-id"] = cfg["login_customer_id"].replace("-", "")

    base_url = f"https://googleads.googleapis.com/v17/customers/{customer_id}/googleAds:search"

    # --- Main query: get all enabled/paused ads ---
    query = """
        SELECT
            ad_group_ad.ad.id,
            ad_group_ad.ad.name,
            ad_group_ad.ad.type,
            ad_group_ad.status,
            ad_group_ad.ad.image_ad.image_url,
            ad_group_ad.ad.responsive_display_ad.headlines,
            ad_group_ad.ad.expanded_text_ad.headline_part1,
            ad_group_ad.ad.responsive_search_ad.headlines,
            campaign.name,
            ad_group.name
        FROM ad_group_ad
        WHERE ad_group_ad.status IN ('ENABLED', 'PAUSED')
        LIMIT 200
    """

    ads = []
    try:
        resp = requests.post(base_url, headers=headers, json={"query": query}, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        if "error" in data:
            print(f"  ⚠  Google Ads error: {data['error'].get('message', data['error'])}")
            return []

        for row in data.get("results", []):
            aga = row.get("adGroupAd", {})
            ad_data = aga.get("ad", {})
            ad_type = ad_data.get("type", "")
            status = aga.get("status", "UNKNOWN").upper()
            campaign_name = row.get("campaign", {}).get("name", "")
            ad_group_name = row.get("adGroup", {}).get("name", "")

            image_url = ""
            headline = ""

            if ad_type == "IMAGE_AD":
                image_url = ad_data.get("imageAd", {}).get("imageUrl", "")

            elif ad_type == "RESPONSIVE_DISPLAY_AD":
                rda = ad_data.get("responsiveDisplayAd", {})
                hl_list = rda.get("headlines") or []
                headline = hl_list[0].get("text", "") if hl_list else ""

            elif ad_type == "EXPANDED_TEXT_AD":
                headline = ad_data.get("expandedTextAd", {}).get("headlinePart1", "")

            elif ad_type == "RESPONSIVE_SEARCH_AD":
                rsa = ad_data.get("responsiveSearchAd", {})
                hl_list = rsa.get("headlines") or []
                headline = hl_list[0].get("text", "") if hl_list else ""

            name = (
                ad_data.get("name")
                or f"{campaign_name}"
                or ad_group_name
                or "Unnamed Ad"
            )

            ads.append({
                "id": str(ad_data.get("id", "")),
                "name": name,
                "status": status,
                "image_url": image_url,
                "headline": headline,
                "body": "",
                "campaign": campaign_name,
                "ad_type": ad_type,
            })

        # Try to backfill image URLs for responsive display ads via asset query
        ads = _backfill_google_images(ads, customer_id, headers, base_url)

    except Exception as e:
        print(f"  ✗  Google Ads fetch failed: {e}")
        return []

    print(f"  ✓  {len(ads)} Google ads")
    return ads


def _backfill_google_images(ads, customer_id, headers, base_url):
    """Attempt to get image URLs for responsive display ads."""
    rda_ids = [a["id"] for a in ads if not a["image_url"] and a.get("ad_type") == "RESPONSIVE_DISPLAY_AD"]
    if not rda_ids:
        return ads

    try:
        # Get marketing image asset resource names for RDA ads
        id_list = ", ".join(f"'{i}'" for i in rda_ids[:50])
        rda_query = f"""
            SELECT
                ad_group_ad.ad.id,
                ad_group_ad.ad.responsive_display_ad.marketing_images,
                ad_group_ad.ad.responsive_display_ad.square_marketing_images
            FROM ad_group_ad
            WHERE ad_group_ad.ad.id IN ({id_list})
        """
        resp = requests.post(base_url, headers=headers, json={"query": rda_query}, timeout=30)
        rda_data = resp.json()

        # Build ad_id → asset resource_name map
        ad_asset_map = {}
        for row in rda_data.get("results", []):
            ad = row.get("adGroupAd", {}).get("ad", {})
            ad_id = str(ad.get("id", ""))
            rda = ad.get("responsiveDisplayAd", {})
            images = rda.get("marketingImages") or rda.get("squareMarketingImages") or []
            if images:
                rn = images[0].get("asset", "")
                if rn:
                    ad_asset_map[ad_id] = rn

        if not ad_asset_map:
            return ads

        # Fetch asset image URLs
        asset_query = """
            SELECT asset.resource_name, asset.image_asset.full_size.url
            FROM asset
            WHERE asset.type = 'IMAGE'
            LIMIT 500
        """
        resp = requests.post(base_url, headers=headers, json={"query": asset_query}, timeout=30)
        asset_data = resp.json()

        asset_url_map = {}
        for row in asset_data.get("results", []):
            asset = row.get("asset", {})
            rn = asset.get("resourceName", "")
            url = asset.get("imageAsset", {}).get("fullSize", {}).get("url", "")
            if rn and url:
                asset_url_map[rn] = url

        for ad in ads:
            if not ad["image_url"] and ad["id"] in ad_asset_map:
                rn = ad_asset_map[ad["id"]]
                if rn in asset_url_map:
                    ad["image_url"] = asset_url_map[rn]

    except Exception as e:
        print(f"  ⚠  Could not backfill Google image assets: {e}")

    return ads


# ============================================================
#  STACKADAPT
# ============================================================
def fetch_stackadapt_ads():
    cfg = CONFIG["stackadapt"]
    if not cfg["enabled"]:
        return []

    print("→ Fetching StackAdapt...")
    api_key = cfg["api_key"]
    url = "https://api.stackadapt.com/graphql"
    headers = {
        "Authorization": f"token {api_key}",
        "Content-Type": "application/json",
    }

    # Primary query attempt
    query_v1 = """
    {
      campaigns(nativeFilter: {status: {eq: "active"}}) {
        id
        name
        status
        lineItems {
          id
          name
          status
          creatives {
            id
            name
            type
            status
            imageUrl: image_url
          }
        }
      }
    }
    """

    # Fallback with nodes pagination pattern
    query_v2 = """
    {
      campaigns {
        nodes {
          id
          name
          status
          lineItems {
            nodes {
              id
              name
              status
              creatives {
                nodes {
                  id
                  name
                  type
                  status
                  imageUrl
                }
              }
            }
          }
        }
      }
    }
    """

    ads = []
    try:
        resp = requests.post(url, headers=headers, json={"query": query_v1}, timeout=30)
        data = resp.json()

        if data.get("errors"):
            # Try fallback schema
            resp = requests.post(url, headers=headers, json={"query": query_v2}, timeout=30)
            data = resp.json()

        campaigns_raw = data.get("data", {}).get("campaigns", [])
        campaign_list = (
            campaigns_raw
            if isinstance(campaigns_raw, list)
            else campaigns_raw.get("nodes", [])
        )

        for camp in campaign_list:
            camp_name = camp.get("name", "")
            line_items_raw = camp.get("lineItems", [])
            line_items = (
                line_items_raw
                if isinstance(line_items_raw, list)
                else line_items_raw.get("nodes", [])
            )

            for li in line_items:
                creatives_raw = li.get("creatives", [])
                creatives = (
                    creatives_raw
                    if isinstance(creatives_raw, list)
                    else creatives_raw.get("nodes", [])
                )

                for creative in creatives:
                    image_url = (
                        creative.get("imageUrl")
                        or creative.get("image_url")
                        or creative.get("imageURL")
                        or ""
                    )
                    status = (
                        creative.get("status")
                        or li.get("status")
                        or camp.get("status")
                        or "ACTIVE"
                    ).upper()

                    ads.append({
                        "id": str(creative.get("id", "")),
                        "name": creative.get("name") or li.get("name") or camp_name or "Unnamed",
                        "status": status,
                        "image_url": image_url,
                        "headline": camp_name,
                        "body": "",
                        "campaign": camp_name,
                    })

    except Exception as e:
        print(f"  ✗  StackAdapt fetch failed: {e}")

    print(f"  ✓  {len(ads)} StackAdapt creatives")
    return ads


# ============================================================
#  HTML GENERATION
# ============================================================
STATUS_MAP = {
    "ACTIVE":   ("#16a34a", "#dcfce7"),
    "ENABLED":  ("#16a34a", "#dcfce7"),
    "PAUSED":   ("#d97706", "#fef3c7"),
    "INACTIVE": ("#dc2626", "#fee2e2"),
    "DISABLED": ("#dc2626", "#fee2e2"),
    "REMOVED":  ("#6b7280", "#f3f4f6"),
}


def _badge(status):
    color, bg = STATUS_MAP.get(status.upper(), ("#6b7280", "#f3f4f6"))
    label = status.replace("_", " ").upper()
    return (
        f'<span style="background:{bg};color:{color};border:1px solid {color};'
        f'padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;'
        f'letter-spacing:.4px;white-space:nowrap;">{label}</span>'
    )


def _card(ad):
    name = ad.get("name", "Unnamed")
    display_name = (name[:52] + "…") if len(name) > 52 else name
    status = ad.get("status", "UNKNOWN")
    img_url = ad.get("image_url", "")
    headline = ad.get("headline", "") or ad.get("campaign", "")
    text_preview = (headline[:90] + "…") if len(headline) > 90 else headline

    if img_url:
        img_block = (
            f'<img src="{img_url}" alt="{name}" loading="lazy" '
            f'style="width:100%;height:160px;object-fit:cover;display:block;" '
            f'onerror="this.style.display=\'none\';'
            f'this.nextElementSibling.style.display=\'flex\';">'
            f'<div class="txt-placeholder">{text_preview or "Image failed to load"}</div>'
        )
    else:
        img_block = f'<div class="txt-placeholder">{text_preview or "Text Ad"}</div>'

    return f"""<div class="card">
  <div class="card-img">{img_block}</div>
  <div class="card-body">
    <div class="card-name">{display_name}</div>
    {_badge(status)}
  </div>
</div>"""


def _section(key, ads, label, color, icon):
    count = len(ads)
    active = sum(1 for a in ads if a.get("status", "").upper() in ("ACTIVE", "ENABLED"))

    if ads:
        cards_html = "\n".join(_card(a) for a in ads)
    else:
        cards_html = (
            '<p style="color:#94a3b8;font-size:13px;padding:8px 0 16px;">'
            "No ads returned — check credentials or active campaigns.</p>"
        )

    return f"""<section class="platform-section">
  <div class="platform-header" style="border-bottom-color:{color};">
    <div class="platform-icon" style="background:{color};">{icon}</div>
    <span class="platform-label">{label}</span>
    <span class="platform-count">{active} active / {count} total</span>
  </div>
  <div class="card-grid">
    {cards_html}
  </div>
</section>"""


def generate_html(meta_ads, google_ads, stackadapt_ads):
    now = datetime.now().strftime("%b %d, %Y  %I:%M %p")
    total = len(meta_ads) + len(google_ads) + len(stackadapt_ads)
    total_active = (
        sum(1 for a in meta_ads      if a.get("status","").upper() in ("ACTIVE","ENABLED")) +
        sum(1 for a in google_ads    if a.get("status","").upper() in ("ACTIVE","ENABLED")) +
        sum(1 for a in stackadapt_ads if a.get("status","").upper() in ("ACTIVE","ENABLED"))
    )

    sections = (
        _section("meta",       meta_ads,       "Meta Ads",   "#1877F2", "M") +
        _section("google",     google_ads,     "Google Ads", "#4285F4", "G") +
        _section("stackadapt", stackadapt_ads, "StackAdapt", "#00b09b", "S")
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Ad Visual Dashboard</title>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           background: #f1f5f9; color: #1e293b; }}

    .wrapper {{ max-width: 1400px; margin: 0 auto; padding: 24px 20px; }}

    /* ---- Header ---- */
    .top-header {{
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 28px; padding-bottom: 16px;
      border-bottom: 1px solid #e2e8f0;
    }}
    .top-header h1 {{ font-size: 20px; font-weight: 800; color: #0f172a; }}
    .top-header .ts {{ font-size: 11px; color: #94a3b8; margin-top: 3px; }}
    .stat-box {{ text-align: right; }}
    .stat-box .big {{ font-size: 28px; font-weight: 900; color: #0f172a; line-height: 1; }}
    .stat-box .lbl {{ font-size: 11px; color: #94a3b8; margin-top: 2px; }}

    /* ---- Platform section ---- */
    .platform-section {{ margin-bottom: 36px; }}
    .platform-header {{
      display: flex; align-items: center; gap: 10px;
      margin-bottom: 16px; padding-bottom: 10px;
      border-bottom: 2px solid #e2e8f0;
    }}
    .platform-icon {{
      width: 30px; height: 30px; border-radius: 7px;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; font-weight: 900; color: #fff; flex-shrink: 0;
    }}
    .platform-label {{ font-size: 16px; font-weight: 700; color: #0f172a; }}
    .platform-count  {{ font-size: 12px; color: #94a3b8; margin-left: 4px; }}

    /* ---- Card grid ---- */
    .card-grid {{ display: flex; flex-wrap: wrap; gap: 14px; }}

    /* ---- Card ---- */
    .card {{
      background: #fff; border-radius: 10px;
      box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 1px 8px rgba(0,0,0,.04);
      overflow: hidden; width: 178px; flex-shrink: 0;
      transition: box-shadow .15s;
    }}
    .card:hover {{ box-shadow: 0 4px 16px rgba(0,0,0,.12); }}
    .card-img {{ position: relative; width: 100%; height: 160px; overflow: hidden; }}
    .card-img img {{ width: 100%; height: 100%; object-fit: cover; display: block; }}
    .txt-placeholder {{
      width: 100%; height: 160px;
      background: linear-gradient(135deg, #f8fafc, #e2e8f0);
      display: flex; align-items: center; justify-content: center;
      padding: 14px; font-size: 11px; color: #64748b;
      text-align: center; line-height: 1.45;
    }}
    .card-body {{ padding: 10px 10px 12px; }}
    .card-name {{
      font-size: 11px; font-weight: 600; color: #1e293b;
      line-height: 1.35; margin-bottom: 7px;
    }}
  </style>
</head>
<body>
<div class="wrapper">
  <header class="top-header">
    <div>
      <h1>Ad Visual Dashboard</h1>
      <div class="ts">Last refreshed: {now}</div>
    </div>
    <div class="stat-box">
      <div class="big">{total_active}</div>
      <div class="lbl">active / {total} total</div>
    </div>
  </header>

  {sections}
</div>
</body>
</html>"""


# ============================================================
#  MAIN
# ============================================================
def main():
    print("\n── Ad Dashboard Generator ──────────────────")

    meta_ads       = fetch_meta_ads()
    google_ads     = fetch_google_ads()
    stackadapt_ads = fetch_stackadapt_ads()

    print("\n→ Building dashboard.html...")
    html = generate_html(meta_ads, google_ads, stackadapt_ads)
    OUTPUT_FILE.write_text(html, encoding="utf-8")
    print(f"✓  Saved: {OUTPUT_FILE}")

    # Auto-open in browser
    try:
        sys_name = platform.system()
        if sys_name == "Darwin":
            subprocess.Popen(["open", str(OUTPUT_FILE)])
        elif sys_name == "Windows":
            os.startfile(str(OUTPUT_FILE))
        else:
            subprocess.Popen(["xdg-open", str(OUTPUT_FILE)])
    except Exception:
        print("   Open dashboard.html manually in your browser.")

    print("── Done ─────────────────────────────────────\n")


if __name__ == "__main__":
    main()
