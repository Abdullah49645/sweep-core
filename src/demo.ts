import { IntentModel } from './model';
import { rng, sample } from './sim';
import type { HistoryEvent, Intent } from './types';

/**
 * Demo catalogue: a snapshot of the sample TV feed used by Amazon's own
 * react-native-multi-tv-app-sample (giolaq.github.io/scrap-tv-feed).
 * The viewing history below is SEEDED TEST DATA for demos and benchmarks, not real viewing data.
 */
const FEED = 'https://giolaq.github.io/scrap-tv-feed/content';

export interface DemoTitle {
  id: string;
  title: string;
  genres: string[];
  year: number;
  poster: string;
  movie: string;
}

function t(
  slug: string,
  title: string,
  genres: string[],
  year: number,
  dir: string = slug,
  poster = 'poster_1920x1080.jpg',
  movie = 'movie_1080p.mp4',
): DemoTitle {
  return { id: slug, title, genres, year, poster: `${FEED}/${dir}/${poster}`, movie: `${FEED}/${dir}/${movie}` };
}

export const DEMO_TITLES: DemoTitle[] = [
  t('adbt-quest', 'ADBT Quest', ['Adventure', 'Comedy'], 2026, 'adbt-quest', 'adbt-quest.jpg', 'adbt-quest.mp4'),
  t('amazon-dev-hackathon', 'Build, Ship, Shape', ['Tech', 'Documentary'], 2026, 'amazon-dev-hackathon', 'amazon-dev-hackathon.jpg', 'amazon-dev-hackathon.mp4'),
  t('aliens-from-vega', 'Aliens From Vega', ['Sci-Fi'], 2022, 'aliens-from-vega', 'vega.jpg', 'vega.mp4'),
  t('behind-the-screams', 'Behind The Screams', ['Documentary', 'Comedy'], 2022),
  t('cereal-streamz', 'Cereal Streamz', ['Kids', 'Reality'], 2024),
  t('feline-assistant', 'Feline Assistant', ['Comedy', 'Workplace'], 2019),
  t('feline-resources', 'Feline Resources', ['Comedy', 'Workplace'], 2023),
  t('makeup-mayhem', 'Makeup Mayhem', ['Reality', 'Competition'], 2020),
  t('meditation-in-beige', 'Meditation In Beige', ['Lifestyle', 'Wellness'], 2023),
  t('parking-lot-mysteries', 'Parking Lot Mysteries', ['Mystery', 'Drama'], 2024),
  t('parking-wars', 'Parking Wars', ['Comedy', 'Reality'], 2020),
  t('patience-tested', 'Patience Tested', ['Game Show', 'Competition'], 2020),
  t('spot-hunters-season-1', 'Spot Hunters S1', ['Reality', 'Competition'], 2020),
  t('spot-hunters-season-2', 'Spot Hunters S2', ['Reality', 'Competition'], 2021),
  t('startup-strays', 'Startup Strays', ['Comedy', 'Business'], 2024),
  t('stone-cold-makeovers', 'Stone Cold Makeovers', ['Home & Garden', 'Reality'], 2020),
  t('the-accounting-cats', 'The Accounting Cats', ['Comedy', 'Workplace'], 2020),
  t('the-art-of-waiting', 'The Art Of Waiting', ['Educational', 'Wellness'], 2021),
  t('the-beige-knight', 'The Beige Knight', ['Action', 'Comedy'], 2021),
  t('the-boardroom-cats', 'The Boardroom Cats', ['Comedy', 'Workplace'], 2021),
  t('the-corporate-litter', 'The Corporate Litter', ['Comedy', 'Workplace'], 2020),
  t('the-endless-queue', 'The Endless Queue', ['Thriller', 'Horror'], 2019),
  t('the-extra-mile', 'The Extra Mile', ['Drama', 'Workplace'], 2023),
  t('the-great-beige-bakeoff', 'The Great Beige Bakeoff', ['Competition', 'Food'], 2021),
  t('the-great-parking-shortage', 'The Great Parking Shortage', ['Documentary', 'Drama'], 2021),
  t('the-it-cats', 'The IT Cats', ['Comedy', 'Tech'], 2024),
  t('the-waiting-dead', 'The Waiting Dead', ['Horror', 'Thriller'], 2019),
];

export const DEMO_GENRES = ['Comedy', 'Workplace', 'Reality', 'Competition', 'Documentary', 'Horror', 'Kids', 'Sci-Fi'];

/** App-side intent with the payload a TV app needs to act on it. */
export interface DemoIntent extends Intent {
  titleId?: string;
  genre?: string;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export const titleIntentId = (titleId: string) => `title-${titleId}`;
export const genreIntentId = (genre: string) => `genre-${slug(genre)}`;

export const DEMO_RESUME_TITLE = 'the-accounting-cats';
export const DEMO_NEXT_TITLE = 'spot-hunters-season-2';

/** Home screen in conventional order: continue-watching first, then catalogue, genres, actions. */
export const DEMO_INTENTS: DemoIntent[] = [
  {
    id: 'resume',
    label: 'Resume: The Accounting Cats',
    kind: 'resume',
    titleId: DEMO_RESUME_TITLE,
    boost: 1.5,
    boostReason: 'Paused 12 min in',
  },
  {
    id: 'next',
    label: 'Next: Spot Hunters S2',
    kind: 'next',
    titleId: DEMO_NEXT_TITLE,
    boost: 1.0,
    boostReason: 'Finished S1 yesterday',
  },
  ...DEMO_TITLES.map((d): DemoIntent => ({ id: titleIntentId(d.id), label: d.title, kind: 'title', titleId: d.id })),
  ...DEMO_GENRES.map((g): DemoIntent => ({ id: genreIntentId(g), label: g, kind: 'genre', genre: g })),
  { id: 'captions', label: 'Captions on/off', kind: 'action' },
  { id: 'back', label: 'Back', kind: 'back' },
];

/** Intents for a genre page: its titles plus Back. */
export function genreIntents(genre: string): DemoIntent[] {
  return [
    ...DEMO_TITLES.filter((d) => d.genres.indexOf(genre) >= 0).map(
      (d): DemoIntent => ({ id: titleIntentId(d.id), label: d.title, kind: 'title', titleId: d.id }),
    ),
    { id: 'back', label: 'Back', kind: 'back' },
  ];
}

const DAY = 86400000;

/** Seeded history: two weeks of choices skewed toward workplace comedies and reality competitions. */
export function demoHistory(now: number): HistoryEvent[] {
  const picks: Array<[string, number]> = [
    ['resume', 0.5], ['title-the-accounting-cats', 1], ['next', 1.2], ['title-spot-hunters-season-1', 1.5],
    ['title-the-it-cats', 2], ['genre-comedy', 2.2], ['title-feline-resources', 3], ['resume', 3.5],
    ['title-the-boardroom-cats', 4], ['captions', 4.1], ['title-makeup-mayhem', 5], ['genre-reality', 5.2],
    ['title-the-it-cats', 6], ['title-patience-tested', 7], ['next', 8], ['title-the-great-beige-bakeoff', 9],
    ['captions', 10], ['title-feline-assistant', 11], ['genre-comedy', 12], ['title-the-corporate-litter', 13],
  ];
  return picks.map(([intentId, daysAgo]) => ({ intentId, at: now - daysAgo * DAY }));
}

/**
 * A fixed benchmark task list: targets drawn from the user's own (seeded) history distribution,
 * so the same tasks are used for baseline and Sweep. Excludes Back.
 */
export function demoTasks(model: IntentModel, intents: DemoIntent[], now: number, count = 8, seed = 2026): DemoIntent[] {
  const probs = model.probabilities(intents, now);
  const r = rng(seed);
  const out: DemoIntent[] = [];
  let guard = 0;
  while (out.length < count && guard++ < 1000) {
    const it = intents[sample(probs, r)]!;
    if (it.kind !== 'back') out.push(it);
  }
  return out;
}
