# Connecting this journal to your own Notion

The site is plain static HTML (GitHub Pages). It never talks to Notion directly. Every call goes through a
**Cloudflare Worker** (`trade-journal-proxy.daniel-mouldd.workers.dev`), which holds the Notion token and
the Claude API key. That Worker belongs to your friend, so right now this copy reads and writes **their**
Notion. You need your own Notion databases, your own Worker, and then you swap a few IDs.

```
Browser (GitHub Pages) ──► Your Cloudflare Worker ──► api.notion.com  (your 4 databases)
                                                 └──► api.anthropic.com (AI grading / weekly coaching)
Screenshots ──► Imgur ──► image URL appended to the trade's Notion page
```

---

## 1. Create the 4 Notion databases

Property names and types have to match **exactly** (capitalization, spaces, `P&L ($)`, the lowercase
`switched`). Select options get created automatically the first time the UI writes them, but adding
them up front keeps things tidy.

### A. Trades (`DB_ID`): used by every page

| Property | Type | Values / notes |
|---|---|---|
| Trade Name | **Title** | auto: `NQ Long — NY AM` |
| Date | Date | |
| Instrument | Select | NQ, ES, MNQ, MES, CL, GC, RTY |
| Direction | Select | Long, Short |
| Session | Select | Asia, London, NY AM, NY Lunch, NY PM, Overnight |
| Timeframe | Select | 1m, 3m, 5m, 15m, 1h, 4h, Daily |
| Status | Select | `Closed - Win`, `Closed - Loss`, `Breakeven` (exact text, since win-rate stats look for these) |
| Setup Grade | Select | A++, A+, A, A-, B+, B, B-, C, D |
| Followed Rules | Select | `Yes ✅`, `Partially ⚠️`, `No ❌` (emoji included) |
| Entry Price | Number | |
| Exit Price | Number | |
| Stop Loss | Number | |
| Take Profit | Number | |
| Contracts | Number | |
| P&L ($) | Number | |
| R:R | Number | |
| Duration (mins) | Number | |
| Entry Time | Text | e.g. `9:42 AM` |
| Exit Time | Text | |
| HTF Timeframe | Text | |
| Entry Model | Text | |
| Notes | Text | partial exits get stored here as an `Exit breakdown: …` line |
| Mistakes | Text | |
| Lessons Learned | Text | |
| Confluences | Multi-select | MSS, Displacement, IFVG, FVG, OTE, Order Block, Liquidity Sweep, BSL Taken, SSL Taken, SMT Divergence, HTF PDA Delivery, HTF Trend, Kill Zone, CISD, LRLR… (full list in `CONFLUENCE_GROUPS` in `admin/admin-core.js`) |
| Emotions | Multi-select | Neutral / Calm, Focused / In the Zone, Confident, Anxious / Nervous, Frustrated, Angry, Tilted, Greedy, FOMO, Tired / Unfocused, Revenge Mode, Overconfident |
| Emotion Notes | Text | |

**Page body:** chart screenshots are **image blocks** (external URL) inside each trade page. The cards
also pick up TradingView `tradingview.com/x/...` links and old `📸 Screenshot: <url>` paragraphs. If you
log trades by hand in Notion, paste the image or TradingView link into the page body.

### B. Daily Bias (`BIAS_DB`): Bias page, Pre-market, Checklist

| Property | Type | Values |
|---|---|---|
| Title | **Title** | auto: `NQ Bullish — 2026-10-17` |
| Date | Date | |
| Instrument | Select | NQ, ES |
| Bias | Select | Bullish, Bearish, Ranging, Waiting |
| switched | Checkbox | lowercase `s`; true = mid-day bias switch |
| Notes | Text | |

### C. Weekly Reviews (`WEEKLY_DB`)

| Property | Type |
|---|---|
| Title | **Title** |
| Week Start | Date |
| Week End | Date |
| Trade Count | Number |
| Win Rate | Number (stored as 0–1, so set the format to Percent) |
| Total P&L | Number |
| Best Trade | Number |
| Worst Trade | Number |
| Mental State | Number (1–5) |
| Discipline | Number (1–5) |
| Submitted | Checkbox |
| What Went Well | Text |
| Needs Improvement | Text |
| Next Week Goal | Text |
| Focus Confluences | Text |
| AI Coaching | Text |
| Extra Note | Text |

### D. Violations (`VIOLATIONS_DB`): Prop Firm page punishments

| Property | Type | Values |
|---|---|---|
| Punishment | **Title** | |
| Description | Text | |
| Type | Select | task, timer |
| Completed | Checkbox | |
| Date | Date | |
| Completed At | Date | |

> To create a Title column with a custom name, rename the default "Name" column. Each database can only
> have one Title.

---

## 2. Create a Notion integration and share the databases

1. Go to <https://www.notion.so/profile/integrations>, click **New integration** (type: Internal), and
   copy the **Internal Integration Secret** (`ntn_…`).
2. Open each of the 4 databases, click **••• → Connections → add your integration**. If you skip this,
   the API returns `object_not_found`.
3. Copy each database ID. Open the database as a full page; the URL looks like
   `notion.so/<workspace>/`**`5398f956345943b7b12b2298bbb6e127`**`?v=…`, and the 32 characters before
   `?v=` are the ID.

## 3. Deploy your own Worker

1. In the Cloudflare dashboard (free plan works), go to **Workers & Pages → Create → Worker**, name it
   (e.g. `trade-journal-proxy`), and deploy.
2. **Edit code**: replace the contents with [`worker/worker.js`](worker/worker.js) from this repo and
   deploy. Edit `RULEBOOK` at the top to hold your own rules. The AI grades trades against it.
3. **Settings → Variables and Secrets**: add two *Secrets*:
   - `NOTION_TOKEN`: the integration secret from step 2
   - `ANTHROPIC_API_KEY`: from <https://console.anthropic.com> (only needed for AI grading/coaching;
     everything else works without it, and log-trade falls back to local grading)
4. Note your Worker URL: `https://trade-journal-proxy.<your-subdomain>.workers.dev`.

Quick test (should return JSON with `"results": []`):

```bash
curl -X POST https://YOUR-WORKER.workers.dev/notion/databases/YOUR_TRADES_DB_ID/query -H "Content-Type: application/json" -d '{}'
```

## 4. Point the site at your Worker + databases

The URL and IDs are hard-coded in several files. Replace them in each one:

| File | What to change |
|---|---|
| `admin/admin-core.js:2-7` | `WORKER`, `DB_ID`, `BIAS_DB`, `WEEKLY_DB`, `VIOLATIONS_DB`, **and `PASS`** (admin password) |
| `index.html:824-825` | `WORKER_URL`, `DATABASE_ID` (trades) |
| `analytics.html:629-630` | `WORKER_URL`, `DATABASE_ID` |
| `rules.html:347-348` | `WORKER_URL`, `DATABASE_ID` |
| `checklist.html:407-408` | `WORKER`, `BIAS_DB` |
| `admin/log-trade.html:191`, `admin/edit-trade.html:563` | `IMGUR_CLIENT_ID` (optional; register your own at <https://api.imgur.com/oauth2/addclient>) |

Find-and-replace does most of it:

```bash
grep -rl "daniel-mouldd" . | xargs sed -i '' 's#trade-journal-proxy.daniel-mouldd.workers.dev#YOUR-WORKER.workers.dev#g'
```

Then commit, push, and enable GitHub Pages on your repo. Personal bits like the YouTube link in `nav.js`
and the logo/title are cosmetic.

---

## Security notes (read before you go live)

- **The admin password is visible to anyone.** `PASS` sits in plain text in `admin/admin-core.js`, and
  the "auth" is just a `sessionStorage` flag. Anyone who views the page source can open the admin pages.
  Change it, but don't treat it as real protection.
- **The Worker is an open proxy.** Anyone who has your Worker URL can read, create, and edit pages in every
  database your integration can see, and can spend your Claude credits through `/verify`. Only connect
  the integration to these 4 databases, and set a spending limit in the Anthropic console. If the
  journal stays private, a follow-up worth doing is adding a secret header that the Worker checks.
- Your friend's database IDs and Worker URL are in this repo's git history. That's harmless to you, but
  tell them, since their Worker is open the same way.
