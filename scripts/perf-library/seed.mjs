// Builds a LOCAL SQLite bench database from src/db/migrations and seeds four users
// (0 / 500 / 2,000 / 5,000 library places). Refuses any URL that is not file:.
// Run from the repo root: node scripts/perf-library/seed.mjs /abs/path/bench.db
import fs from 'fs';
import path from 'path';
import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';

const dbFile = process.argv[2];
if (!dbFile || !path.isAbsolute(dbFile)) throw new Error('pass an absolute db file path');
const url = `file:${dbFile}`;
if (!url.startsWith('file:')) throw new Error('refusing non-file database');
for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) fs.rmSync(f, { force: true });

const client = createClient({ url });

// ---- schema from the repo's own migrations --------------------------------
const dir = 'src/db/migrations';
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = fs.readFileSync(path.join(dir, file), 'utf8');
  for (const st of sql.split('--> statement-breakpoint')) {
    const t = st.trim();
    if (t) await client.execute(t);
  }
}
const tables = (await client.execute("select name from sqlite_master where type='table' order by name")).rows.map((r) => r.name);
console.log('tables:', tables.join(','));

// ---- deterministic generator -----------------------------------------------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// country, lat, lon, cities (most-saved first)
const GEO = [
  ['Japan', 36, 138, ['Tokyo', 'Kyoto', 'Osaka', 'Nara', 'Hakone', 'Kanazawa', 'Hiroshima', 'Sapporo', 'Fukuoka', 'Nikko', 'Takayama', 'Naoshima', 'Okinawa', 'Kamakura', 'Matsumoto']],
  ['Italy', 42, 12.5, ['Rome', 'Florence', 'Venice', 'Milan', 'Naples', 'Bologna', 'Positano', 'Palermo', 'Turin', 'Siena', 'Lucca', 'Matera', 'Verona', 'Cinque Terre', 'Lecce']],
  ['France', 46, 2, ['Paris', 'Lyon', 'Marseille', 'Nice', 'Bordeaux', 'Annecy', 'Strasbourg', 'Arles', 'Colmar', 'Chamonix', 'Avignon', 'Biarritz']],
  ['United States', 39, -98, ['New York', 'San Francisco', 'Los Angeles', 'Chicago', 'New Orleans', 'Austin', 'Seattle', 'Portland', 'Miami', 'Boston', 'Nashville', 'Santa Fe', 'Honolulu', 'Denver', 'Savannah', 'Charleston']],
  ['Mexico', 23, -102, ['Mexico City', 'Oaxaca', 'Tulum', 'Mérida', 'Guadalajara', 'San Miguel de Allende', 'Puerto Vallarta', 'Puebla', 'Valle de Guadalupe']],
  ['Spain', 40, -3.7, ['Barcelona', 'Madrid', 'Seville', 'San Sebastián', 'Granada', 'Valencia', 'Málaga', 'Bilbao', 'Córdoba', 'Palma']],
  ['Portugal', 39.5, -8, ['Lisbon', 'Porto', 'Sintra', 'Lagos', 'Évora', 'Coimbra', 'Funchal', 'Comporta']],
  ['United Kingdom', 54, -2, ['London', 'Edinburgh', 'Bath', 'Oxford', 'York', 'Cornwall', 'Liverpool', 'Brighton']],
  ['Greece', 39, 22, ['Athens', 'Santorini', 'Mykonos', 'Crete', 'Naxos', 'Thessaloniki', 'Milos', 'Hydra']],
  ['Thailand', 15, 101, ['Bangkok', 'Chiang Mai', 'Phuket', 'Krabi', 'Koh Samui', 'Pai', 'Ayutthaya']],
  ['Vietnam', 16, 107, ['Hanoi', 'Ho Chi Minh City', 'Hội An', 'Da Nang', 'Hạ Long', 'Huế', 'Sa Pa']],
  ['Indonesia', -2, 118, ['Ubud', 'Canggu', 'Seminyak', 'Jakarta', 'Yogyakarta', 'Lombok', 'Komodo']],
  ['Turkey', 39, 35, ['Istanbul', 'Cappadocia', 'Izmir', 'Antalya', 'Bodrum', 'Fethiye']],
  ['Morocco', 32, -6, ['Marrakesh', 'Fes', 'Chefchaouen', 'Essaouira', 'Casablanca', 'Merzouga']],
  ['Peru', -10, -76, ['Lima', 'Cusco', 'Arequipa', 'Sacred Valley', 'Puno']],
  ['Argentina', -34, -64, ['Buenos Aires', 'Mendoza', 'Bariloche', 'Salta', 'El Calafate']],
  ['Brazil', -14, -51, ['Rio de Janeiro', 'São Paulo', 'Salvador', 'Florianópolis', 'Paraty']],
  ['Colombia', 4, -72, ['Bogotá', 'Medellín', 'Cartagena', 'Salento']],
  ['Germany', 51, 10, ['Berlin', 'Munich', 'Hamburg', 'Cologne', 'Dresden', 'Heidelberg']],
  ['Netherlands', 52.2, 5.3, ['Amsterdam', 'Rotterdam', 'Utrecht', 'The Hague']],
  ['Denmark', 56, 10, ['Copenhagen', 'Aarhus', 'Skagen']],
  ['Sweden', 62, 15, ['Stockholm', 'Gothenburg', 'Malmö']],
  ['Norway', 61, 8, ['Oslo', 'Bergen', 'Tromsø', 'Lofoten']],
  ['Iceland', 65, -18, ['Reykjavík', 'Vík', 'Akureyri', 'Húsavík']],
  ['Austria', 47.5, 14.5, ['Vienna', 'Salzburg', 'Hallstatt', 'Innsbruck']],
  ['Switzerland', 46.8, 8.2, ['Zurich', 'Lucerne', 'Zermatt', 'Geneva', 'Interlaken']],
  ['Croatia', 45, 15.5, ['Dubrovnik', 'Split', 'Hvar', 'Zagreb', 'Rovinj']],
  ['Czechia', 49.8, 15.5, ['Prague', 'Český Krumlov', 'Brno']],
  ['Hungary', 47, 19, ['Budapest', 'Eger']],
  ['Ireland', 53.4, -8, ['Dublin', 'Galway', 'Dingle', 'Cork']],
  ['South Korea', 36, 128, ['Seoul', 'Busan', 'Jeju', 'Gyeongju']],
  ['Taiwan', 23.7, 121, ['Taipei', 'Tainan', 'Hualien']],
  ['China', 35, 104, ['Shanghai', 'Beijing', 'Chengdu', "Xi'an", 'Guilin']],
  ['Hong Kong', 22.3, 114.2, ['Hong Kong']],
  ['Singapore', 1.35, 103.8, ['Singapore']],
  ['India', 21, 78, ['Mumbai', 'Delhi', 'Jaipur', 'Udaipur', 'Goa', 'Kerala', 'Varanasi']],
  ['Sri Lanka', 7.8, 80.7, ['Colombo', 'Ella', 'Galle', 'Kandy']],
  ['Australia', -25, 133, ['Sydney', 'Melbourne', 'Byron Bay', 'Hobart', 'Perth', 'Adelaide']],
  ['New Zealand', -41, 174, ['Queenstown', 'Auckland', 'Wellington', 'Wanaka', 'Rotorua']],
  ['South Africa', -30, 25, ['Cape Town', 'Johannesburg', 'Franschhoek', 'Kruger']],
  ['Kenya', 0, 38, ['Nairobi', 'Maasai Mara', 'Lamu']],
  ['Tanzania', -6, 35, ['Zanzibar', 'Arusha', 'Serengeti']],
  ['Egypt', 26, 30, ['Cairo', 'Luxor', 'Aswan']],
  ['Jordan', 31, 36, ['Petra', 'Amman', 'Wadi Rum']],
  ['United Arab Emirates', 24, 54, ['Dubai', 'Abu Dhabi']],
  ['Canada', 56, -106, ['Montreal', 'Vancouver', 'Toronto', 'Quebec City', 'Banff', 'Tofino']],
  ['Chile', -35, -71, ['Santiago', 'Valparaíso', 'Atacama', 'Torres del Paine']],
  ['Cuba', 21.5, -79.5, ['Havana', 'Trinidad', 'Viñales']],
  ['Costa Rica', 10, -84, ['San José', 'Monteverde', 'Nosara', 'La Fortuna']],
  ['Belgium', 50.5, 4.5, ['Brussels', 'Bruges', 'Ghent', 'Antwerp']],
  ['Poland', 52, 19, ['Kraków', 'Warsaw', 'Gdańsk']],
  ['Slovenia', 46, 15, ['Ljubljana', 'Bled', 'Piran']],
  ['Georgia', 42, 43.5, ['Tbilisi', 'Kazbegi']],
  ['Philippines', 13, 122, ['Manila', 'El Nido', 'Siargao', 'Cebu']],
  ['Malaysia', 4, 102, ['Kuala Lumpur', 'Penang', 'Langkawi']],
  ['Cambodia', 12.5, 105, ['Siem Reap', 'Phnom Penh', 'Kampot']],
  ['Nepal', 28, 84, ['Kathmandu', 'Pokhara']],
  ['Bolivia', -16.5, -64.7, ['La Paz', 'Uyuni']],
  ['Ecuador', -1.8, -78, ['Quito', 'Galápagos', 'Cuenca']],
  ['Uruguay', -33, -56, ['Montevideo', 'José Ignacio', 'Colonia del Sacramento']],
];
const TOWN_A = ['San', 'Santa', 'Porto', 'Monte', 'Villa', 'Castel', 'Puerto', 'Bad', 'Saint', 'Nova', 'Alto', 'Vale'];
const TOWN_B = ['Lucía', 'Marino', 'Verde', 'Rosa', 'Clara', 'Bello', 'Franco', 'Elena', 'Doré', 'Sereno', 'Amaro', 'Bianco', 'Ostrava', 'Nieve', 'Fiore', 'Lago', 'Pietra', 'Cruz', 'Sol', 'Mare'];

const KINDS = [
  ['restaurant', 26], ['cafe', 11], ['bar', 8], ['landmark', 9], ['museum', 6], ['hotel', 6], ['beach', 4], ['park', 4],
  ['viewpoint', 4], ['market', 3], ['natural', 4], ['neighborhood', 3], ['shop', 4], ['experience', 3], ['gallery', 2],
  ['tour', 1], ['club', 1], ['thermal', 1],
];
const KIND_TOTAL = KINDS.reduce((n, [, w]) => n + w, 0);

const NAME_WORDS = ['Lumière', 'Aurora', 'Olive', 'Saffron', 'Juniper', 'Marée', 'Kōgen', 'Hikari', 'Sakura', 'Ostra', 'Brisa', 'Fuego', 'Luna', 'Tierra',
  'Cielo', 'Nómada', 'Vela', 'Corazón', 'Bodega', 'Mistral', 'Azul', 'Faro', 'Sal', 'Cedro', 'Granada', 'Nonna', 'Amalfi', 'Pomodoro', 'Basilico', 'Tramonto',
  'Ginkgo', 'Matcha', 'Yuzu', 'Kumo', 'Umi', 'Tsuki', 'Hana', 'Kaze', 'Mori', 'Ishi', 'Alba', 'Brume', 'Écume', 'Sable', 'Ardoise', 'Cerise', 'Fleur', 'Noisette',
  'Copper', 'Harbor', 'Lantern', 'Meridian', 'Wildflower', 'Ember', 'Atlas', 'Compass', 'Driftwood', 'Fig', 'Pine', 'Thistle', 'Rook', 'Sparrow', 'Heron', 'Willow'];
const SURNAMES = ['Rossi', 'Moreau', 'Tanaka', 'García', 'Silva', 'Müller', 'Kowalski', 'Nakamura', 'Dubois', 'Ferreira', 'López', 'Bianchi', 'Sato', 'Novak', 'Papadopoulos', 'Ng', 'Kim', 'Hansen', 'Okafor', 'Haddad'];
const PATTERNS = {
  restaurant: ['Trattoria {w}', 'Osteria {s}', 'Bistro {w}', 'Taquería {w}', 'Izakaya {w}', '{w} Ramen', 'Brasserie {s}', '{w} Kitchen', 'Cantina {w}', 'Casa {s}', '{w} & {w2}', 'Sushi {w}'],
  cafe: ['Café {w}', '{w} Coffee', '{w} Roasters', '{w} Espresso Bar', 'Kissaten {w}', '{w} Bakery'],
  bar: ['Bar {w}', 'The {w} Tavern', '{w} Speakeasy', '{w} Wine Bar', 'Cervecería {w}', '{w} Rooftop'],
  landmark: ['{w} Cathedral', 'Palazzo {s}', '{w} Tower', '{w} Bridge', 'Castle {w}', '{w} Temple', '{w} Shrine', 'Plaza {w}'],
  museum: ['Museum of {w}', 'Museo {s}', '{w} Art Museum', '{w} Design Museum'],
  hotel: ['Hotel {w}', '{w} House', 'Casa {w}', 'Ryokan {w}', '{w} Inn', 'The {w}'],
  beach: ['Praia do {w}', 'Playa {w}', '{w} Beach', '{w} Cove'],
  park: ['{w} Gardens', 'Parque {w}', '{w} Park'],
  viewpoint: ['Mirador {w}', '{w} Lookout', 'Miradouro {w}', '{w} Hill'],
  market: ['{w} Market', 'Mercado {w}', 'Marché {w}'],
  natural: ['{w} Falls', 'Lake {w}', '{w} Gorge', '{w} Peak', '{w} Hot Springs Trail'],
  neighborhood: ['{w} Quarter', 'Barrio {w}', 'Old {w}'],
  shop: ['{w} Books', '{w} Ceramics', '{w} Vintage', 'Atelier {s}'],
  experience: ['{w} Cooking Class', '{w} Walking Tour', '{w} Pottery Workshop', 'Sunset Sail {w}'],
  gallery: ['Galerie {s}', '{w} Gallery'],
  tour: ['{w} Food Tour', '{w} Bike Tour'],
  club: ['Club {w}', '{w} Jazz Club'],
  thermal: ['{w} Onsen', 'Termas {w}'],
};
const VIBES = ['romantic', 'cozy', 'lively', 'hidden-gem', 'local-favorite', 'scenic', 'historic', 'family-friendly', 'trendy', 'quiet', 'sunset', 'rooftop',
  'budget', 'luxury', 'outdoor-seating', 'late-night', 'instagrammable', 'authentic', 'artsy', 'laid-back', 'design', 'seafood', 'natural-wine', 'brunch'];
const TAGS = ['must-do', 'rainy-day', 'date-night', 'with-kids', 'bucket-list', 'food', 'coffee', 'architecture', 'hike', 'swim', 'shopping', 'nightlife', 'day-trip'];
const CUISINES = ['Italian', 'Japanese', 'Mexican', 'French', 'Thai', 'Vietnamese', 'Spanish', 'Portuguese', 'Seafood', 'Vegetarian', 'Korean', 'Indian', 'Peruvian', 'Greek'];
const BEST = ['April to June', 'September and October', 'Spring', 'Summer', 'Winter', 'Year-round', 'November to March', 'Late May', 'Early morning', 'At sunset', 'May', 'October', 'December'];
const RECS = ['Sarah', 'Mom', '@wanderlust.eats', 'Condé Nast Traveler', 'NYT 36 Hours', 'Marco', 'Instagram reel', 'TikTok @foodie', 'Lena', 'Eater'];
const NOTES = ['Go early before the crowds.', 'Ask for the counter seats.', 'Sarah said the pistachio one is unreal.', 'Book two weeks ahead.',
  'Only open in summer — check the season.', 'Perfect for the last night of the trip.', 'Cash only, bring coins for the lockers.',
  'We loved the sunset from the terrace; get there by 7.', 'Try the tasting menu if we splurge.', 'Combine with the market in the morning.'];
const DESC_A = ['A beloved local spot', 'An unhurried, light-filled room', 'A tiny family-run place', 'A landmark that rewards an early start', 'A sweeping view over the old town',
  'A hidden courtyard', 'A modern take on regional classics', 'A quiet escape a few streets from the main square', 'An institution since the 1920s', 'A breezy seaside favourite'];
const DESC_B = ['known for seasonal plates and a short natural-wine list', 'with views that make the climb worth it', 'where the queue moves fast and the reward is worth it',
  'with ceramics, books and a slow pace', 'that locals guard jealously', 'with a terrace that catches the last light', 'serving a menu that changes daily',
  'packed with history and good stories', 'perfect for a long lunch', 'where the staff remember your name'];
const DESC_C = ['Reservations recommended on weekends.', 'Best visited on a weekday morning.', 'Expect a short wait at peak times.', 'Closed on Mondays.', '',
  'The neighbourhood around it is worth a wander.', 'Bring a light jacket; evenings get cool.'];

function pickW(r, list) { return list[Math.floor(r() * list.length)]; }
function some(r, list, min, max) {
  const n = min + Math.floor(r() * (max - min + 1));
  const out = new Set();
  while (out.size < n) out.add(pickW(r, list));
  return [...out];
}
function kindOf(r) {
  let x = r() * KIND_TOTAL;
  for (const [k, w] of KINDS) { if ((x -= w) < 0) return k; }
  return 'restaurant';
}
// Zipf-ish index: heavier on the head of a list.
function zipf(r, n, s = 1.1) {
  let total = 0;
  for (let i = 1; i <= n; i++) total += 1 / i ** s;
  let x = r() * total;
  for (let i = 1; i <= n; i++) { if ((x -= 1 / i ** s) < 0) return i - 1; }
  return n - 1;
}
function iso(ms) { return new Date(ms).toISOString(); }

const START = Date.UTC(2023, 0, 1);
const NOW = Date.UTC(2026, 9, 25);
const hash = bcrypt.hashSync('benchpass123', 8);

async function seedUser(size) {
  const r = rng(1000 + size);
  const userId = `usr_bench_${size}`;
  const now = iso(NOW);
  await client.execute({ sql: 'INSERT INTO users (id,name,email,hashed_password,created_at,updated_at) VALUES (?,?,?,?,?,?)', args: [userId, `Bench ${size}`, `bench${size}@local.test`, hash, now, now] });
  if (size === 0) return { userId, places: 0, photos: 0 };

  const extraInbox = Math.round(size * 0.03);
  const extraArchived = Math.round(size * 0.02);
  const total = size + extraInbox + extraArchived;
  // More places -> a longer tail of small towns per country.
  const townsPerCountry = Math.round(size / 300);
  const towns = GEO.map(() => []);
  GEO.forEach((g, gi) => { for (let t = 0; t < townsPerCountry; t++) towns[gi].push(`${pickW(r, TOWN_A)} ${pickW(r, TOWN_B)}`); });

  const placeRows = [];
  const attRows = [];
  for (let i = 0; i < total; i++) {
    const gi = zipf(r, GEO.length, 1.25);
    const [country, clat, clon, cityList] = GEO[gi];
    const pool = [...cityList, ...towns[gi]];
    const city = pool[zipf(r, pool.length, 1.35)];
    const kind = kindOf(r);
    const pat = pickW(r, PATTERNS[kind]);
    const name = pat.replace('{w}', pickW(r, NAME_WORDS)).replace('{w2}', pickW(r, NAME_WORDS)).replace('{s}', pickW(r, SURNAMES));
    const status = i < size ? 'library' : i < size + extraInbox ? 'inbox' : 'archived';
    const created = START + Math.floor(r() * (NOW - START));
    const vs = r();
    const visitStatus = vs < 0.68 ? 'not_visited' : vs < 0.8 ? 'planned' : 'visited';
    const plannedVisit = visitStatus === 'planned' ? iso(NOW + Math.floor(r() * 365) * 864e5).slice(0, 10) : null;
    const lastVisited = visitStatus === 'visited' ? iso(created + Math.floor(r() * 300) * 864e5).slice(0, 10) : null;
    const id = `plc_b${size}_${String(i).padStart(5, '0')}`;
    placeRows.push([
      id, userId, name, kind, city, country,
      r() < 0.92 ? JSON.stringify({ lat: clat + (r() - 0.5) * 3, lon: clon + (r() - 0.5) * 3 }) : null,
      r() < 0.8 ? `${1 + Math.floor(r() * 300)} ${pickW(r, NAME_WORDS)} Street, ${city}` : null,
      JSON.stringify(r() < 0.1 ? [`${name} (${pickW(r, NAME_WORDS)})`] : []),
      `${pickW(r, DESC_A)} in ${city}, ${pickW(r, DESC_B)}. ${pickW(r, DESC_C)}`.trim(),
      JSON.stringify(r() < 0.6 ? some(r, TAGS, 0, 3) : []),
      JSON.stringify(some(r, VIBES, 1, 5)),
      visitStatus === 'visited' ? Math.floor(r() * 6) : r() < 0.15 ? Math.floor(r() * 6) : 0,
      r() < 0.35 ? pickW(r, NOTES) : null,
      status,
      r() < 0.5 ? '$'.repeat(1 + Math.floor(r() * 4)) : null,
      r() < 0.45 ? pickW(r, BEST) : null,
      kind === 'experience' || kind === 'tour' || kind === 'natural' ? JSON.stringify(some(r, ['hiking', 'swimming', 'photography', 'cooking', 'cycling', 'kayaking'], 1, 3)) : null,
      kind === 'restaurant' ? JSON.stringify(some(r, CUISINES, 1, 2)) : null,
      kind === 'hotel' ? JSON.stringify(some(r, ['pool', 'spa', 'breakfast', 'wifi', 'gym', 'rooftop bar'], 2, 4)) : null,
      iso(created), iso(created),
      status === 'archived' ? now : null,
      visitStatus, Math.floor(r() * 6), lastVisited, plannedVisit,
      r() < 0.2 ? pickW(r, RECS) : null,
      r() < 0.25 ? 'Cash only. Closed Mondays. Reservations recommended two weeks out; the side entrance is easier with luggage.' : null,
    ]);
    if (r() < 0.82) {
      const x = r();
      const n = x < 0.5 ? 1 : x < 0.7 ? 2 : x < 0.85 ? 3 : 4 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const attId = `att_b${size}_${i}_${k}`;
        const img = String(1 + Math.floor(r() * 12)).padStart(2, '0');
        const src = r();
        const source = src < 0.6 ? 'upload' : src < 0.9 ? 'pexels' : 'wikimedia';
        const attribution = source === 'pexels'
          ? JSON.stringify({ kind: 'pexels', photographer: `${pickW(r, NAME_WORDS)} ${pickW(r, SURNAMES)}`, photographerUrl: 'https://www.pexels.com/@bench', photoUrl: 'https://www.pexels.com/photo/1' })
          : source === 'wikimedia'
            ? JSON.stringify({ kind: 'wikimedia', authorText: pickW(r, SURNAMES), licenseShortName: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', descriptionUrl: 'https://commons.wikimedia.org/wiki/File:Bench.jpg' })
            : JSON.stringify({ kind: 'upload' });
        attRows.push([
          attId, id, 'photo', `/bench/full-${img}.jpg?a=${attId}`, `${attId}.jpg`, 'image/jpeg', 400000,
          r() < 0.95 ? `/bench/thumb-${img}.jpg?a=${attId}` : null,
          k === 0 ? 1 : 0, iso(created + k * 1000), source, source === 'upload' ? null : `${source}-${attId}`, attribution,
        ]);
      }
    }
  }

  const PCOLS = 'id,user_id,name,kind,city,country,coords,address,alt_names,description,tags,vibes,rating_self,notes,status,price_level,best_time,activities,cuisine,amenities,created_at,updated_at,archived_at,visit_status,priority,last_visited,planned_visit,recommended_by,practical_info';
  const ACOLS = 'id,place_id,type,uri,filename,mime_type,file_size,thumbnail_uri,is_primary,created_at,source,source_id,attribution';
  const insert = async (table, cols, rows) => {
    const q = `INSERT INTO ${table} (${cols}) VALUES (${cols.split(',').map(() => '?').join(',')})`;
    for (let i = 0; i < rows.length; i += 500) {
      await client.batch(rows.slice(i, i + 500).map((args) => ({ sql: q, args })), 'write');
    }
  };
  await insert('places', PCOLS, placeRows);
  await insert('attachments', ACOLS, attRows);

  // Collections: trips built around a city or country, plus a few themed lists.
  const libIds = placeRows.filter((p) => p[14] === 'library');
  const nCols = Math.round(size / 120) + 3;
  const colRows = [];
  const linkRows = [];
  for (let c = 0; c < nCols; c++) {
    const cid = `col_b${size}_${c}`;
    const anchor = pickW(r, libIds);
    const byCountry = r() < 0.5;
    const members = libIds.filter((p) => (byCountry ? p[5] === anchor[5] : p[4] === anchor[4]));
    const themed = c % 5 === 4;
    const list = themed ? some(r, libIds, 10, 40) : members.slice(0, 8 + Math.floor(r() * 140));
    const name = themed ? pickW(r, ['Date nights', 'Rainy day ideas', 'Coffee crawl', 'Bucket list', 'Best views', 'Splurge dinners']) + ` ${c}` : `${byCountry ? anchor[5] : anchor[4]} ${2025 + Math.floor(r() * 3)}`;
    colRows.push([cid, userId, name, themed ? 'A list of favourites' : null, now, now]);
    [...new Set(list.map((p) => p[0]))].forEach((pid, k) => linkRows.push([pid, cid, k, 0, r() < 0.1 ? 'Try to fit this in on day two.' : null]));
  }
  await insert('collections', 'id,user_id,name,description,created_at,updated_at', colRows);
  await insert('places_to_collections', 'place_id,collection_id,order_index,is_pinned,note', linkRows);

  const heartRows = libIds.filter(() => r() < 0.08).map((p) => [`hrt_${p[0]}`, userId, p[0], now]);
  await insert('place_hearts', 'id,user_id,place_id,created_at', heartRows);
  await insert('saved_views', 'id,user_id,name,query,created_at,updated_at', [
    [`svw_b${size}_1`, userId, 'Japan food', 'countries=Japan&kinds=restaurant', now, now],
    [`svw_b${size}_2`, userId, 'Planned trips', 'shelf=planned&group=city', now, now],
    [`svw_b${size}_3`, userId, 'Coffee', 'kinds=cafe', now, now],
  ]);
  const cities = new Set(libIds.map((p) => `${p[4]}|${p[5]}`)).size;
  const countries = new Set(libIds.map((p) => p[5])).size;
  return { userId, library: size, total, photos: attRows.length, collections: nCols, links: linkRows.length, hearts: heartRows.length, cities, countries };
}

for (const size of [0, 500, 2000, 5000]) console.log(JSON.stringify(await seedUser(size)));
const counts = await client.execute('select (select count(*) from users) u, (select count(*) from places) p, (select count(*) from attachments) a, (select count(*) from collections) c');
console.log('counts', JSON.stringify(counts.rows[0]));
client.close();
