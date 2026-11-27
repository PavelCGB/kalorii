// Разбор текста с этикетки (после распознавания на телефоне): КБЖУ, вес порции, пересчёт на 100 г.
// Никакого ИИ — чистые правила, поэтому работает офлайн и бесплатно.

const N = (m, i = 1) => (m ? parseFloat(m[i]) : null);

export function parseLabel(raw) {
  const text = String(raw || '');
  const t = ' ' + text.toLowerCase().replace(/,/g, '.').replace(/ё/g, 'е').replace(/\s+/g, ' ') + ' ';

  // «Белки 24 г», «белка 24», «24 г белка», «protein 24»
  const after = (word) => N(t.match(new RegExp(`${word}\\D{0,8}(\\d{1,3}(?:\\.\\d+)?)`)));
  const before = (word) => N(t.match(new RegExp(`(\\d{1,3}(?:\\.\\d+)?)\\s*г?\\s*${word}`)));

  const kcal = N(t.match(/(\d{2,4}(?:\.\d+)?)\s*(?:ккал|kcal|калори(?:й|и))/));
  const p = after('белк') ?? after('белка') ?? after('protein') ?? before('белк');
  const f = after('жир') ?? after('fat') ?? before('жир');
  const c = after('углевод') ?? after('carbs?') ?? before('углевод');

  const weight = N(t.match(/(\d{3,4}(?:\.\d+)?)\s*г(?!\w)/));          // 900 г
  const portions = N(t.match(/(\d{1,3})\s*(?:порци|порц\b)/));          // 30 порций
  const scoopByPack = weight && portions ? Math.round((weight / portions) * 10) / 10 : null;

  // кофеин: «кофеин 32 мг», «32 мг кофеина», «32 мг/100 мл»
  const caffeine = N(t.match(/кофеин\w*\D{0,14}(\d{1,3})\s*мг/))
    ?? N(t.match(/(\d{1,3})\s*мг\D{0,12}кофеин/))
    ?? N(t.match(/(\d{1,3})\s*мг\s*(?:кофеина)?\s*(?:\/|на)\s*100\s*мл/));

  const perPortion = /в порци|за порци|в 1 порци|на порци|\/\s*порци/.test(t) && !/на 100/.test(t);
  const k = perPortion && scoopByPack ? 100 / scoopByPack : 1;
  const r1 = (v) => (v == null ? null : Math.round(v * k * 10) / 10);

  const nameLine = text.split('\n').map((s) => s.trim()).find((s) => /[a-zа-я]{3}/i.test(s)) || '';

  return {
    kcal: r1(kcal), p: r1(p), f: r1(f), c: r1(c), caffeine,
    scoop: scoopByPack, perPortion, weight, portions,
    name: nameLine.slice(0, 60),
  };
}
