// Cloudflare Worker: бесплатное распознавание фото еды и упаковок через Workers AI.
// Ключей в приложении нет — оно ходит только на этот адрес.
// Лимит: 20 фото в день на устройство (случайный id из localStorage), общий предел — 10k нейронов/день.
const DAILY_LIMIT = 20;
const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
const TEXT_MODEL = '@cf/meta/llama-3.2-3b-instruct';
const MAX_TOKENS = 700;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'content-type': 'application/json; charset=utf-8',
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: cors });

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return json({ error: 'Только POST' }, 405);

    let body;
    try { body = await req.json(); } catch { return json({ error: 'Некорректный JSON' }, 400); }
    const { image, mediaType = 'image/jpeg', prompt = '', system = '', id = '' } = body || {};
    if (!prompt) return json({ error: 'Нужен prompt' }, 400);
    if (!id) return json({ error: 'Нет id устройства' }, 400);

    const day = new Date().toISOString().slice(0, 10);
    const key = `u:${String(id).slice(0, 64)}:${day}`;
    const used = Number(await env.KV.get(key)) || 0;
    if (used >= DAILY_LIMIT) {
      return json({ error: `На сегодня лимит запросов (${DAILY_LIMIT}) исчерпан — попробуй завтра` }, 429);
    }

    let out;
    try {
      if (image) {
        const bytes = [...Buffer.from(image, 'base64')];
        out = await env.AI.run(VISION_MODEL, { prompt: `${system}\n\n${prompt}`.trim(), image: bytes, max_tokens: MAX_TOKENS });
      } else {
        out = await env.AI.run(TEXT_MODEL, { prompt: `${system}\n\n${prompt}`.trim(), max_tokens: 400 });
      }
    } catch (e) {
      return json({ error: 'ИИ не ответил: ' + (e.message || e) }, 502);
    }

    await env.KV.put(key, String(used + 1), { expirationTtl: 172800 });

    const text = typeof out === 'string' ? out : (out.response || out.result?.response || JSON.stringify(out));
    const m = String(text).match(/\{[\s\S]*\}/);
    if (!m) return json({ error: 'ИИ ответил не по формату', raw: String(text).slice(0, 500) }, 502);
    try {
      return json(JSON.parse(m[0]));
    } catch {
      return json({ error: 'ИИ ответил не JSON', raw: String(text).slice(0, 500) }, 502);
    }
  },
};
