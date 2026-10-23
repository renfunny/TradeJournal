// Creates the 4 Notion databases this journal needs, then points the site at them.
//
// Usage (Node 18+):
//   NOTION_TOKEN=ntn_xxx NOTION_PARENT=<page url or id> node scripts/setup-notion.mjs
//   add WORKER_URL=https://your-worker.workers.dev to also swap the Worker URL
//   add --dry-run to print what would be created without calling Notion
//
// The parent page must be shared with your integration (page ••• → Connections).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const IDS_FILE = join(ROOT, 'notion-ids.json');

const opts = names => ({ options: names.map(name => ({ name })) });
const select = names => ({ select: opts(names) });
const multi = names => ({ multi_select: opts(names) });
const text = { rich_text: {} };
const num = (format = 'number') => ({ number: { format } });
const date = { date: {} };
const check = { checkbox: {} };
const title = { title: {} };

const CONFLUENCES = [
  'MSS', 'Displacement', 'IFVG', 'FVG', 'First Presented FVG (9:30 AM Open)', 'OTE', 'Rejection Block',
  'Suspension Block', 'Order Block', 'Breaker Block', 'Mitigation Block', 'PDA Array', 'Liquidity Sweep',
  'Stop Hunt', 'BSL Taken', 'SSL Taken', 'Equal Highs/Lows', 'SMT Divergence', 'HTF PDA Delivery', 'HTF Trend',
  'Retracement', 'Clear Targets', 'Volume', 'ATH', 'Fib Target (-0.5)', 'Market Maker Model', 'Power of 3',
  '10 AM Reversal (Power of 3)', 'ATM Model (Asia Session)', 'Macro', 'Judas Swing', 'Kill Zone', 'RTH Gap',
  'Octants', 'Quadrants', 'NWOG', 'NDOG', 'Asian Range', 'CISD', 'LRLR',
];

const EMOTIONS = [
  'Neutral / Calm', 'Focused / In the Zone', 'Confident', 'Anxious / Nervous', 'Frustrated', 'Angry',
  'Tilted', 'Greedy', 'FOMO', 'Tired / Unfocused', 'Revenge Mode', 'Overconfident',
];

// key = the constant name used in the site code; oldId = your friend's ID currently in the repo
const DATABASES = [
  {
    key: 'DB_ID', name: 'Trades', icon: '📈', oldId: '5398f956345943b7b12b2298bbb6e127',
    properties: {
      'Trade Name': title,
      'Date': date,
      'Instrument': select(['NQ', 'ES', 'MNQ', 'MES', 'CL', 'GC', 'RTY']),
      'Direction': select(['Long', 'Short']),
      'Session': select(['Asia', 'London', 'NY AM', 'NY Lunch', 'NY PM', 'Overnight']),
      'Timeframe': select(['1m', '3m', '5m', '15m', '1h', '4h', 'Daily']),
      'Status': select(['Closed - Win', 'Closed - Loss', 'Breakeven']),
      'Setup Grade': select(['A++', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C', 'D']),
      'Followed Rules': select(['Yes ✅', 'Partially ⚠️', 'No ❌']),
      'Entry Price': num(),
      'Exit Price': num(),
      'Stop Loss': num(),
      'Take Profit': num(),
      'Contracts': num(),
      'P&L ($)': num('dollar'),
      'R:R': num(),
      'Duration (mins)': num(),
      'Entry Time': text,
      'Exit Time': text,
      'HTF Timeframe': text,
      'Entry Model': text,
      'Notes': text,
      'Mistakes': text,
      'Lessons Learned': text,
      'Confluences': multi(CONFLUENCES),
      'Emotions': multi(EMOTIONS),
      'Emotion Notes': text,
    },
  },
  {
    key: 'BIAS_DB', name: 'Daily Bias', icon: '🧭', oldId: 'c163f7373bb44be19ae4f4a886384ddf',
    properties: {
      'Title': title,
      'Date': date,
      'Instrument': select(['NQ', 'ES']),
      'Bias': select(['Bullish', 'Bearish', 'Ranging', 'Waiting']),
      'switched': check,
      'Notes': text,
    },
  },
  {
    key: 'WEEKLY_DB', name: 'Weekly Reviews', icon: '🗓️', oldId: '6d1309c6e6174f489e32293e253ae729',
    properties: {
      'Title': title,
      'Week Start': date,
      'Week End': date,
      'Trade Count': num(),
      'Win Rate': num('percent'),
      'Total P&L': num('dollar'),
      'Best Trade': num('dollar'),
      'Worst Trade': num('dollar'),
      'Mental State': num(),
      'Discipline': num(),
      'Submitted': check,
      'What Went Well': text,
      'Needs Improvement': text,
      'Next Week Goal': text,
      'Focus Confluences': text,
      'AI Coaching': text,
      'Extra Note': text,
    },
  },
  {
    key: 'VIOLATIONS_DB', name: 'Violations', icon: '🛑', oldId: '3882ac472cd280a0a446d576c20fb20c',
    properties: {
      'Punishment': title,
      'Description': text,
      'Type': select(['task', 'timer']),
      'Completed': check,
      'Date': date,
      'Completed At': date,
    },
  },
];

// Files that hard-code the Worker URL or database IDs
const SITE_FILES = [
  'admin/admin-core.js', 'index.html', 'analytics.html', 'rules.html', 'checklist.html',
];
const OLD_WORKER = 'https://trade-journal-proxy.daniel-mouldd.workers.dev';

function parsePageId(input) {
  const hex = (input || '').split(/[?#]/)[0].replace(/-/g, '').match(/[0-9a-f]{32}$/i)?.[0];
  if (!hex) throw new Error(`Can't find a page ID in NOTION_PARENT: "${input}"`);
  return hex;
}

async function notion(path, body) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion ${res.status}: ${data.message || JSON.stringify(data)}`);
  return data;
}

async function main() {
  if (!DRY && !process.env.NOTION_TOKEN) throw new Error('Set NOTION_TOKEN to your integration secret.');
  const parent = DRY ? '0'.repeat(32) : parsePageId(process.env.NOTION_PARENT);
  if (existsSync(IDS_FILE) && !FORCE && !DRY) {
    throw new Error('notion-ids.json already exists, so the databases were probably created already. Pass --force to create another set.');
  }

  const created = {};
  for (const db of DATABASES) {
    const body = {
      parent: { type: 'page_id', page_id: parent },
      icon: { type: 'emoji', emoji: db.icon },
      title: [{ type: 'text', text: { content: db.name } }],
      properties: db.properties,
    };
    if (DRY) {
      console.log(`[dry-run] would create "${db.name}" with ${Object.keys(db.properties).length} properties`);
      created[db.key] = db.oldId;
      continue;
    }
    const res = await notion('/databases', body);
    created[db.key] = res.id.replace(/-/g, '');
    console.log(`✓ ${db.name}: ${created[db.key]}  ${res.url}`);
  }
  if (DRY) return;

  writeFileSync(IDS_FILE, JSON.stringify(created, null, 2) + '\n');

  const worker = process.env.WORKER_URL?.replace(/\/$/, '');
  for (const file of SITE_FILES) {
    const path = join(ROOT, file);
    let src = readFileSync(path, 'utf8');
    for (const db of DATABASES) src = src.replaceAll(db.oldId, created[db.key]);
    if (worker) src = src.replaceAll(OLD_WORKER, worker);
    writeFileSync(path, src);
  }
  console.log(`\nUpdated database IDs${worker ? ' and Worker URL' : ''} in: ${SITE_FILES.join(', ')}`);
  if (!worker) console.log('Worker URL not changed. Re-run the find-and-replace in NOTION_SETUP.md once your Worker is deployed.');
  console.log('IDs saved to notion-ids.json');
}

main().catch(e => { console.error('✗ ' + e.message); process.exit(1); });
