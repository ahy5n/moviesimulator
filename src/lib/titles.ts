// Title, logline and IP generators built from per-genre word banks.
import type { Genre, Tone } from './types';
import type { RNG } from './rng';

const W: Record<Genre, { nouns: string[]; adjs: string[]; patterns: string[] }> = {
  Action: { nouns: ['Protocol', 'Vector', 'Strike', 'Fury', 'Ronin', 'Payload', 'Breach', 'Extraction', 'Siege', 'Ironclad', 'Velocity', 'Detonator'], adjs: ['Lethal', 'Rogue', 'Maximum', 'Zero', 'Last', 'Black', 'Hard', 'Final'], patterns: ['{adj} {noun}', '{noun}', 'The {noun}', '{noun} Point', 'Operation {noun}'] },
  Comedy: { nouns: ['Wedding', 'Roommates', 'Holiday', 'Reunion', 'Weekend', 'Interns', 'Neighbours', 'Bachelor', 'Hangover', 'Road Trip', 'Office', 'In-Laws'], adjs: ['Totally', 'Seriously', 'Accidental', 'Bad', 'Big', 'Awkward', 'Very', 'Utterly'], patterns: ['The {noun}', '{adj} {noun}', '{noun} from Hell', 'My {adj} {noun}', 'Meet the {noun}'] },
  Drama: { nouns: ['Silence', 'River', 'Inheritance', 'Harvest', 'Promise', 'Letters', 'Winter', 'Shore', 'Vigil', 'Daughter', 'Garden', 'Witness'], adjs: ['Quiet', 'Distant', 'Golden', 'Broken', 'Small', 'Long', 'Late', 'Paper'], patterns: ['The {adj} {noun}', '{noun}', 'A {adj} {noun}', 'All the {noun}s', 'The {noun} Years'] },
  Horror: { nouns: ['Hollow', 'Rot', 'Visitor', 'Cellar', 'Hymn', 'Static', 'Teeth', 'Mother', 'Crawlspace', 'Effigy', 'Wake', 'Veil'], adjs: ['Unholy', 'Pale', 'Hungry', 'Silent', 'Deep', 'Crooked', 'Sleepless', 'Rotten'], patterns: ['{noun}', 'The {noun}', 'It Came from the {noun}', '{adj} {noun}', 'Do Not Open the {noun}'] },
  'Sci-Fi': { nouns: ['Horizon', 'Singularity', 'Orbit', 'Echo', 'Colony', 'Paradox', 'Signal', 'Nebula', 'Ark', 'Synthesis', 'Drift', 'Eclipse'], adjs: ['Dark', 'Last', 'Infinite', 'Hollow', 'Second', 'Cold', 'Quantum', 'Distant'], patterns: ['{noun}', '{adj} {noun}', 'The {noun} Protocol', 'Beyond the {noun}', '{noun} 9'] },
  Romance: { nouns: ['Summer', 'Paris', 'Letters', 'Heart', 'Proposal', 'Moonlight', 'Coffee', 'Sunsets', 'Promise', 'Rain', 'Waltz', 'Postcards'], adjs: ['Endless', 'Second', 'Sweet', 'Last', 'Little', 'Perfect', 'Golden', 'Lucky'], patterns: ['{adj} {noun}', 'Love in {noun}', 'The {noun}', 'One {adj} {noun}', '{noun} for Two'] },
  Thriller: { nouns: ['Witness', 'Alibi', 'Cipher', 'Undertow', 'Proof', 'Stranger', 'Glass', 'Debt', 'Asset', 'Motive', 'Leverage', 'Deadline'], adjs: ['Silent', 'Perfect', 'Double', 'Cold', 'Hidden', 'False', 'Final', 'Blind'], patterns: ['The {adj} {noun}', '{noun}', '{adj} {noun}', 'No {noun}', 'The {noun} Game'] },
  Animation: { nouns: ['Lantern', 'Whiskers', 'Moonbeam', 'Pebble', 'Kingdom', 'Robot', 'Dragon', 'Island', 'Toybox', 'Cloud', 'Owl', 'Comet'], adjs: ['Little', 'Brave', 'Tiny', 'Magic', 'Giant', 'Wild', 'Lost', 'Sleepy'], patterns: ['{adj} {noun}', 'The {adj} {noun}', '{noun} and Friends', 'Captain {noun}', 'The {noun} Who Could'] },
  Fantasy: { nouns: ['Throne', 'Crown', 'Sword', 'Grimoire', 'Wyrm', 'Realm', 'Oracle', 'Citadel', 'Ember', 'Thorn', 'Covenant', 'Shard'], adjs: ['Shattered', 'Ashen', 'Eternal', 'Forgotten', 'Silver', 'Ninth', 'Hollow', 'Starborn'], patterns: ['The {adj} {noun}', '{noun} of the {adj}', 'The {noun}', '{noun}fall', 'Rise of the {noun}'] },
  Superhero: { nouns: ['Sentinel', 'Vanguard', 'Nightshade', 'Titan', 'Aegis', 'Volt', 'Paragon', 'Specter', 'Kestrel', 'Bastion', 'Nova', 'Warden'], adjs: ['Uncanny', 'Mighty', 'Dark', 'Infinite', 'Savage', 'Astonishing', 'Ultimate', 'Iron'], patterns: ['{noun}', 'The {adj} {noun}', '{noun}: Origins', '{noun} Rising', 'League of {noun}s'] },
  Musical: { nouns: ['Broadway', 'Melody', 'Encore', 'Jukebox', 'Rhapsody', 'Ballroom', 'Chorus', 'Spotlight', 'Overture', 'Serenade', 'Tango', 'Revue'], adjs: ['Grand', 'Midnight', 'Starlit', 'Golden', 'Electric', 'Last', 'Sweet', 'Moonlit'], patterns: ['{adj} {noun}', 'The {noun}', '{noun}!', 'Sing, {noun}', 'One More {noun}'] },
  War: { nouns: ['Beachhead', 'Frontline', 'Trenches', 'Garrison', 'Ridge', 'Convoy', 'Armistice', 'Brigade', 'Outpost', 'Valley', 'Sky', 'Harbor'], adjs: ['Bloody', 'Last', 'Iron', 'Burning', 'Long', 'Silent', 'Red', 'Grey'], patterns: ['The {adj} {noun}', '{noun}', 'Hold the {noun}', 'Battle for the {noun}', 'Hill {num}'] },
  Western: { nouns: ['Gulch', 'Outlaw', 'Frontier', 'Rider', 'Mesa', 'Bounty', 'Rustlers', 'Canyon', 'Marshal', 'Spur', 'Badlands', 'Gallows'], adjs: ['Dust', 'Lonesome', 'Dead', 'High', 'Red', 'Silver', 'Hard', 'Savage'], patterns: ['{adj} {noun}', 'The {noun}', '{noun} Creek', 'Ride to {noun}', 'A {noun} Too Far'] },
  Crime: { nouns: ['Heist', 'Syndicate', 'Racket', 'Docks', 'Kingpin', 'Ledger', 'Vice', 'Precinct', 'Smuggler', 'Wiretap', 'Family', 'Score'], adjs: ['Dirty', 'Crooked', 'Blood', 'Cold', 'Neon', 'Brass', 'Low', 'Wicked'], patterns: ['{adj} {noun}', 'The {noun}', '{noun} City', 'The Last {noun}', 'Kings of the {noun}'] },
  Documentary: { nouns: ['Ocean', 'Archive', 'Machine', 'Voices', 'Harvest', 'Summit', 'Planet', 'Record', 'Truth', 'Frontier', 'Chorus', 'Inquiry'], adjs: ['Hidden', 'Untold', 'Secret', 'Living', 'Final', 'Wild', 'Rising', 'Quiet'], patterns: ['The {adj} {noun}', '{adj} {noun}', '{noun}: An Inquiry', 'Inside the {noun}', 'The {noun} Project'] },
  Family: { nouns: ['Puppy', 'Treehouse', 'Holiday', 'Treasure', 'Snow Day', 'Camp', 'Pony', 'Circus', 'Bakery', 'Rocket', 'Secret Club', 'Zoo'], adjs: ['Great', 'Super', 'Big', 'Merry', 'Crazy', 'Little', 'Wonderful', 'Amazing'], patterns: ['The {adj} {noun}', '{noun} Adventure', 'Our {adj} {noun}', 'A {noun} to Remember', 'Operation {noun}'] },
};

export function genTitle(r: RNG, g: Genre, g2?: Genre): string {
  const bank = W[g];
  const alt = g2 && r.chance(0.35) ? W[g2] : bank;
  const p = r.pick(bank.patterns);
  return p.replace('{adj}', r.pick(alt.adjs)).replace('{noun}', r.pick(bank.nouns)).replace('{num}', String(r.int(17, 409)));
}

const HEROES = ['a disgraced detective', 'a retired assassin', 'two estranged sisters', 'a small-town teacher', 'a grieving widower', 'an ambitious chef', 'a teenage hacker', 'a washed-up rock star', 'a rookie astronaut', 'a reluctant heir', 'a single mother', 'a con artist', 'a lonely android', 'an exiled prince', 'a wedding planner', 'a burned-out surgeon', 'a stubborn grandmother', 'a talking fox', 'a wartime nurse', 'a ranch hand'];
const GOALS: Record<Genre, string[]> = {
  Action: ['must stop a rogue weapons cartel', 'races across three continents to clear their name', 'has 24 hours to rescue a kidnapped diplomat'],
  Comedy: ['accidentally books two weddings on the same day', 'pretends to be a millionaire for one chaotic weekend', 'inherits a failing llama farm'],
  Drama: ['returns home to confront a family secret', 'fights to keep the family farm alive', 'rebuilds a life after a devastating loss'],
  Horror: ['moves into a house that remembers its owners', 'hears a hymn nobody else can', 'discovers the town has a hungry tradition'],
  'Sci-Fi': ['wakes on a colony ship 200 years off course', 'intercepts a signal from their future self', 'must negotiate with a planet that thinks'],
  Romance: ['falls for the rival bookshop owner across the street', 'swaps homes with a stranger for the summer', 'keeps meeting the same person at airports'],
  Thriller: ['is the only witness to a murder that never happened', 'discovers their spouse has a second identity', 'is blackmailed into a perfect crime'],
  Animation: ['sets out to find the lost lantern of the sea', 'befriends a cloud who wants to be a mountain', 'leads a rebellion of forgotten toys'],
  Fantasy: ['must reforge a shattered crown before winter', 'is chosen by a dragon nobody believed existed', 'steals a spellbook that steals back'],
  Superhero: ['gains powers they never wanted and a city that needs them', 'must unite a broken team against a cosmic threat', 'discovers their mentor is the villain'],
  Musical: ['bets everything on one night on Broadway', 'reunites a 90s girl group for a final tour', 'turns a failing diner into a dance hall'],
  War: ['leads a lost platoon behind enemy lines', 'smuggles orphans across a burning border', 'holds a bridge for three impossible days'],
  Western: ['hunts the gang that burned their homestead', 'defends a frontier town from a railroad baron', 'escorts a prisoner across the badlands'],
  Crime: ['plans one last heist against the mob', 'goes undercover in a family empire', 'tries to launder money through a bakery'],
  Documentary: ['investigates the collapse of a tech empire', 'follows a year inside the world\'s deepest mine', 'reveals the hidden lives of city foxes'],
  Family: ['must save the town Christmas parade', 'trains a hopeless puppy for the big show', 'builds a rocket in the backyard'],
};

export function genLogline(r: RNG, g: Genre, g2: Genre | undefined, tone: Tone): string {
  const hero = r.pick(HEROES);
  const goal = r.pick(GOALS[g]);
  const twist = g2 && g2 !== g ? r.pick(GOALS[g2]).split(' ').slice(0, 4).join(' ') : '';
  const tail = tone === 'dark' ? ', whatever the cost.' : tone === 'light' ? ' — with hilarious consequences.' : '.';
  const s = `${hero[0].toUpperCase()}${hero.slice(1)} ${goal}${twist && r.chance(0.4) ? ` and ${twist}…` : ''}`;
  return s.endsWith('…') ? s : s + tail;
}

export function genPremises(r: RNG, g: Genre, g2: Genre | undefined, tone: Tone, n = 3): string[] {
  const out = new Set<string>();
  while (out.size < n) out.add(genLogline(r, g, g2, tone));
  return [...out];
}

const IP_PATTERNS: Record<string, string[]> = {
  Novel: ['The {noun} Chronicles', '{adj} {noun}', 'A {noun} in Autumn', 'The {noun} of {place}'],
  'Video game': ['{noun}: Reckoning', '{noun} Wars', 'Project {noun}', '{adj} {noun} Online'],
  Comic: ['The {adj} {noun}', '{noun} Squad', 'Agent {noun}', '{noun}-Man'],
  Remake: ['{adj} {noun} ({year})', 'The {noun} ({year})'],
};
const PLACES = ['Ravenmoor', 'Eastwick Bay', 'Port Solace', 'Kestrel Hollow', 'New Avalon', 'Saltmarsh', 'Oldcastle', 'Mirrorfall'];

export function genIPTitle(r: RNG, kind: string, g: Genre): string {
  const b = W[g];
  return r.pick(IP_PATTERNS[kind]).replace('{noun}', r.pick(b.nouns)).replace('{adj}', r.pick(b.adjs))
    .replace('{place}', r.pick(PLACES)).replace('{year}', String(r.int(1958, 1996)));
}

const QUOTES: { min: number; lines: string[] }[] = [
  { min: 85, lines: ['An instant classic.', 'Nothing short of a triumph.', 'The best film of the year, full stop.', 'Breathtaking from first frame to last.', 'A masterclass in craft.'] },
  { min: 70, lines: ['Smart, assured and deeply satisfying.', 'A crowd-pleaser with real heart.', 'Confident filmmaking that mostly soars.', 'Well worth the ticket.', 'Funnier, sharper and braver than expected.'] },
  { min: 55, lines: ['Solid if unspectacular.', 'Entertaining enough, forgotten by the car park.', 'Has its moments.', 'A mixed bag with a few great scenes.', 'Fine. Just fine.'] },
  { min: 40, lines: ['A muddled misfire.', 'Lots of noise, little to say.', 'Talented people, wasted.', 'Overlong and under-cooked.', 'It never quite comes together.'] },
  { min: 0, lines: ['A catastrophe of the highest order.', 'Avoid at all costs.', 'Two hours I will never get back.', 'Somehow worse than the trailer.', 'A career low for everyone involved.'] },
];
export function reviewQuote(r: RNG, score: number): string {
  return r.pick(QUOTES.find((q) => score >= q.min)!.lines);
}
