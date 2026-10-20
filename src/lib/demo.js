// Optional, read-only sample journal. Shop names are invented and neighborhoods are
// generic so nothing here reads as a claim about a real business. These entries are
// only ever shown in demo mode and are never written to storage.

import { makeEntry } from './entry.js';

const created = new Date('2026-01-01T00:00:00Z');

const SAMPLES = [
  {
    shop: 'Lantern Leaf (sample)',
    drink: 'Roasted oolong milk tea',
    visitDate: '2026-04-18',
    place: 'Old Town',
    price: 6.25,
    teaBase: 'Oolong',
    sweetness: '50%',
    ice: 'Light ice',
    toppings: ['Boba'],
    tags: ['Cozy', 'Quiet'],
    notes: 'Toasty, nutty finish. Pearls were warm and soft.',
    rating: 5,
  },
  {
    shop: 'Copper Kettle (sample)',
    drink: 'Brown sugar fresh milk',
    visitDate: '2026-03-02',
    place: 'Riverside',
    price: 7,
    teaBase: 'Milk',
    sweetness: '75%',
    ice: 'Regular ice',
    toppings: ['Boba', 'Pudding'],
    tags: ['Lively', 'Late night'],
    notes: 'Rich. Shared it, which was the right call.',
    rating: 4,
  },
  {
    shop: 'Moss & Steam (sample)',
    drink: 'Iced matcha with cheese foam',
    visitDate: '2026-02-11',
    place: 'Market District',
    price: 7.5,
    teaBase: 'Matcha',
    sweetness: '25%',
    ice: 'Regular ice',
    toppings: ['Cheese foam'],
    tags: ['Quiet', 'Good for work'],
    rating: 4,
  },
  {
    shop: 'Lantern Leaf (sample)',
    drink: 'Jasmine green with grass jelly',
    visitDate: '2026-01-25',
    place: 'Old Town',
    price: 5.5,
    teaBase: 'Jasmine',
    sweetness: '25%',
    ice: 'Light ice',
    toppings: ['Grass jelly'],
    tags: ['Cozy'],
    notes: 'Floral and clean. Grass jelly was a little firm.',
    rating: 3,
  },
  {
    shop: 'Night Market Cart (sample)',
    drink: 'Hot hojicha latte',
    visitDate: '2026-01-09',
    place: 'Harbor Front',
    teaBase: 'Hojicha',
    sweetness: '0%',
    ice: 'Hot',
    tags: ['Outdoor seating', 'Takeaway only'],
    notes: 'Forgot to note the price.',
  },
];

export const DEMO_ENTRIES = Object.freeze(
  SAMPLES.map((fields, i) => Object.freeze(makeEntry(fields, { id: `sample-${i + 1}`, now: created }))),
);
