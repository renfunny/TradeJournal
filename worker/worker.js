// Cloudflare Worker: CORS proxy between the journal UI and the Notion + Claude APIs.
// Reconstructed from how the front-end calls it. Paste into a Worker in the Cloudflare
// dashboard and set two secrets: NOTION_TOKEN and ANTHROPIC_API_KEY.
//
//   /notion/<path>  → https://api.notion.com/v1/<path>   (GET / POST / PATCH passthrough)
//   /verify         → Claude grades a trade, returns { result, grade, followedRules }

const NOTION_VERSION = '2022-06-28'; // the UI uses /databases/{id}/query, which newer versions replaced
const MODEL = 'claude-opus-5-5';

// Put your own trading rules here — the AI grades every trade against this.
const RULEBOOK = `
- Only trade in the direction of the HTF bias.
- Entry requires a liquidity sweep + MSS/CISD + an entry PDA (IFVG/FVG) inside a kill zone.
- Stop loss is always placed at entry. No moving stop to breakeven early.
- Max 2 losses per day, max 4 trades per day.
`;

const SYSTEM = `You are a strict futures trading coach. Grade the trade against the trader's rulebook:
${RULEBOOK}
Explain what was done right and what broke the rules. End your answer with exactly two lines:
VERDICT: YES | PARTIALLY | NO
GRADE: one of A++, A+, A, A-, B+, B, B-, C, D`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);

    if (url.pathname.startsWith('/notion/')) {
      const target = 'https://api.notion.com/v1/' + url.pathname.slice('/notion/'.length) + url.search;
      const res = await fetch(target, {
        method: request.method,
        headers: {
          Authorization: `Bearer ${env.NOTION_TOKEN}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
        },
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text(),
      });
      return new Response(res.body, { status: res.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (url.pathname === '/verify' && request.method === 'POST') {
      const { trade } = await request.json();
      // The weekly review page sends a full coaching prompt through this same endpoint.
      const isRawPrompt = /^You are /.test(trade || '');
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'server-side-fallback-2026-07-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 16000,
          output_config: { effort: 'medium' },
          fallbacks: 'default',
          ...(isRawPrompt ? {} : { system: SYSTEM }),
          messages: [{ role: 'user', content: trade }],
        }),
      });
      const data = await res.json();
      if (!res.ok) return json({ result: `AI error: ${data.error?.message || res.status}` }, 502);
      if (data.stop_reason === 'refusal') return json({ result: 'The AI declined to review this trade.' });

      const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      const verdict = text.match(/VERDICT:\s*(YES|PARTIALLY|NO)/i)?.[1]?.toUpperCase();
      const grade = text.match(/GRADE:\s*(A\+\+|A\+|A-|A|B\+|B-|B|C|D)/i)?.[1]?.toUpperCase();
      return json({ result: text, grade, followedRules: verdict });
    }

    return json({ error: 'Not found' }, 404);
  },
};
