// Проверка разбора этикетки: запуск — node test-label.mjs
import { parseLabel } from './kalorii/label.js';

// твоя банка «Вэй Про»: значения на порцию, 900 г / 30 порций
const a = parseLabel('Вэй Про\n117 ккал в порции\n24 г белка в порции\n900 г\n30 порций');
console.assert(a.scoop === 30, 'скуп 30 г, получено ' + a.scoop);
console.assert(a.kcal === 390, '390 ккал на 100 г, получено ' + a.kcal);
console.assert(a.p === 80, '80 г белка на 100 г, получено ' + a.p);

// обычная таблица на 100 г
const b = parseLabel('Энергетическая ценность на 100 г\nБелки 76 г\nЖиры 6 г\nУглеводы 9 г\n380 ккал');
console.assert(b.kcal === 380 && b.p === 76 && b.f === 6 && b.c === 9, 'таблица на 100 г ' + JSON.stringify(b));

// банка энергетика: калорийность и кофеин
const d = parseLabel('LIT ENERGY\nЭнергетическая ценность 45 ккал\nКофеин 32 мг/100 мл');
console.assert(d.kcal === 45 && d.p == null, 'энергетик ' + JSON.stringify(d));
console.assert(d.caffeine === 32, 'кофеин 32 мг/100 мл, получено ' + d.caffeine);

console.log('label.js ok');
