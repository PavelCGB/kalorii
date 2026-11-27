// Проверка разбора состава: node test-sweet.mjs
import { sweetInfo } from './kalorii/sweet.js';

const cola = sweetInfo({ additives: ['en:e951', 'en:e950', 'en:e330'], ingredients: 'вода, краситель, аспартам, ацесульфам К' });
console.assert(cola.found.length === 2, 'два заменителя, найдено ' + cola.found.length);
console.assert(cola.found.some((s) => s.code === 'e951' && s.risk === 2), 'аспартам должен быть «настороженным»');
console.assert(cola.hasSugar === false, 'сахара тут нет');

const stevia = sweetInfo({ additives: ['en:e960'], ingredients: 'вода, стевиолгликозиды' });
console.assert(stevia.found.length === 1 && stevia.found[0].risk === 0, 'стевия мягкая');

const sugar = sweetInfo({ additives: [], ingredients: 'вода, сахар, лимонная кислота' });
console.assert(sugar.found.length === 0 && sugar.hasSugar === true, 'обычный сахар');

const empty = sweetInfo({});
console.assert(empty.found.length === 0 && empty.inText.length === 0 && empty.hasSugar === false, 'пустой состав');

console.log('sweet.js ok');
