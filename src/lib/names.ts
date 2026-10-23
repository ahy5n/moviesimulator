// Name banks for fictional people. Combinations are random; any match to a real person is coincidental.
import type { Gender } from './types';
import type { RNG } from './rng';

type Bank = { m: string[]; f: string[]; last: string[]; countries: string[] };

const BANKS: Record<string, Bank> = {
  anglo: {
    m: ['Callum', 'Ezra', 'Jonah', 'Rhys', 'Declan', 'Silas', 'Tobias', 'Wesley', 'Ronan', 'Felix', 'Caleb', 'Harvey', 'Miles', 'Jasper', 'Dorian', 'Grady', 'Beckett', 'Theo', 'Archer', 'Rowan', 'Fletcher', 'Ellis', 'Lachlan', 'Nolan', 'Quentin', 'Reid', 'Sawyer', 'Tate', 'Wyatt', 'August'],
    f: ['Imogen', 'Delphine', 'Tamsin', 'Wren', 'Marlowe', 'Hazel', 'Juniper', 'Odessa', 'Saoirse', 'Briar', 'Coralie', 'Elodie', 'Fern', 'Harlow', 'Ivy', 'Lark', 'Maeve', 'Nell', 'Paloma', 'Quinn', 'Rosalind', 'Sloane', 'Tilly', 'Vesper', 'Winona', 'Blythe', 'Clementine', 'Esme', 'Greer', 'Margo'],
    last: ['Ashdown', 'Blackwood', 'Carrow', 'Dunmore', 'Ellery', 'Fairbanks', 'Garrick', 'Hollister', 'Ingram', 'Jessop', 'Kendrick', 'Lockhart', 'Marlowe', 'Northcott', 'Oakley', 'Pemberton', 'Quill', 'Radcliffe', 'Stirling', 'Thorne', 'Underhill', 'Vance', 'Whitlock', 'Yardley', 'Ashby', 'Brennan', 'Calloway', 'Devereux', 'Easton', 'Fenwick', 'Galloway', 'Hartigan', 'Kellerman', 'Langford', 'Merriweather', 'Prescott', 'Rourke', 'Sinclair', 'Tremaine', 'Winslow'],
    countries: ['US', 'US', 'US', 'US', 'GB', 'GB', 'CA', 'AU', 'IE', 'NZ'],
  },
  india: {
    m: ['Aarav', 'Vihaan', 'Kabir', 'Reyansh', 'Arjun', 'Ishaan', 'Dhruv', 'Advait', 'Rudra', 'Shaurya', 'Vivaan', 'Ayaan', 'Karthik', 'Siddharth', 'Nikhil', 'Varun', 'Rohan', 'Aditya', 'Pranav', 'Yash'],
    f: ['Aanya', 'Diya', 'Ishita', 'Kiara', 'Myra', 'Saanvi', 'Anika', 'Tara', 'Meher', 'Riya', 'Nitya', 'Avni', 'Zoya', 'Kavya', 'Ira', 'Mira', 'Prisha', 'Aditi', 'Sanya', 'Tanvi'],
    last: ['Mehra', 'Kapoor', 'Malhotra', 'Iyer', 'Reddy', 'Nair', 'Desai', 'Bhatia', 'Chopra', 'Rao', 'Menon', 'Saxena', 'Joshi', 'Pillai', 'Varma', 'Sethi', 'Kulkarni', 'Banerjee', 'Shetty', 'Ahuja'],
    countries: ['IN'],
  },
  pakistan: {
    m: ['Hamza', 'Faraz', 'Zain', 'Usman', 'Bilal', 'Danish', 'Saad', 'Arsalan', 'Imran', 'Junaid', 'Adnan', 'Fawad', 'Sameer', 'Ahad', 'Shehryar'],
    f: ['Ayesha', 'Mahnoor', 'Hania', 'Sana', 'Iqra', 'Mehwish', 'Zara', 'Alizeh', 'Hira', 'Noor', 'Saba', 'Amna', 'Rabia', 'Maya', 'Sajal'],
    last: ['Qureshi', 'Siddiqui', 'Butt', 'Chaudhry', 'Malik', 'Sheikh', 'Rizvi', 'Hashmi', 'Abbasi', 'Mirza', 'Durrani', 'Javed', 'Khattak', 'Baig', 'Ansari'],
    countries: ['PK'],
  },
  korea: {
    m: ['Ji-ho', 'Min-jun', 'Seo-jun', 'Do-yun', 'Ha-joon', 'Jae-won', 'Tae-hyun', 'Woo-jin', 'Sung-min', 'Hyun-woo'],
    f: ['Seo-yeon', 'Ji-woo', 'Ha-eun', 'Soo-ah', 'Ye-jin', 'Min-seo', 'Da-eun', 'Yu-na', 'Chae-won', 'Hye-jin'],
    last: ['Kang', 'Yoon', 'Jang', 'Lim', 'Han', 'Oh', 'Seo', 'Shin', 'Kwon', 'Hwang', 'Ahn', 'Song', 'Baek', 'Nam', 'Moon'],
    countries: ['KR'],
  },
  china: {
    m: ['Haoran', 'Zihan', 'Yichen', 'Junjie', 'Mingyu', 'Tianyi', 'Zhiwei', 'Kaiwen', 'Bowen', 'Ruoxi'],
    f: ['Xinyi', 'Yutong', 'Shiyu', 'Ruolan', 'Mengyao', 'Jiaxin', 'Wanting', 'Siqi', 'Yifei', 'Lanxi'],
    last: ['Zhao', 'Qian', 'Sun', 'Zhou', 'Wu', 'Zheng', 'Feng', 'Chen', 'Lu', 'Shen', 'Han', 'Yang', 'Xu', 'Tang', 'Lin'],
    countries: ['CN', 'CN', 'HK', 'TW'],
  },
  japan: {
    m: ['Haruto', 'Sota', 'Yuto', 'Riku', 'Kaito', 'Ren', 'Hayato', 'Daiki', 'Takumi', 'Kenta'],
    f: ['Yui', 'Hina', 'Aoi', 'Sakura', 'Mio', 'Rin', 'Hana', 'Akari', 'Nanami', 'Kokoro'],
    last: ['Takahashi', 'Watanabe', 'Kobayashi', 'Nakamura', 'Yamada', 'Matsumoto', 'Inoue', 'Kimura', 'Shimizu', 'Mori', 'Ishikawa', 'Fujita', 'Okada', 'Hasegawa', 'Ogawa'],
    countries: ['JP'],
  },
  french: {
    m: ['Mathis', 'Lucas', 'Hugo', 'Raphaël', 'Bastien', 'Étienne', 'Gaspard', 'Lucien', 'Antoine', 'Valentin'],
    f: ['Camille', 'Margaux', 'Léa', 'Inès', 'Céleste', 'Manon', 'Anaïs', 'Juliette', 'Solène', 'Agathe'],
    last: ['Laurent', 'Moreau', 'Fontaine', 'Rousseau', 'Mercier', 'Girard', 'Lemaire', 'Duval', 'Chevalier', 'Marchand', 'Delacroix', 'Benoît', 'Faure', 'Garnier', 'Roussel'],
    countries: ['FR', 'FR', 'BE'],
  },
  hispanic: {
    m: ['Mateo', 'Santiago', 'Diego', 'Alejandro', 'Joaquín', 'Emiliano', 'Rafael', 'Tomás', 'Iker', 'Bruno'],
    f: ['Valentina', 'Camila', 'Lucía', 'Ximena', 'Renata', 'Paula', 'Daniela', 'Mariana', 'Ines', 'Catalina'],
    last: ['Navarro', 'Ortega', 'Delgado', 'Castillo', 'Vargas', 'Fuentes', 'Ibarra', 'Salazar', 'Cortés', 'Montoya', 'Peralta', 'Rivas', 'Serrano', 'Villalobos', 'Zamora'],
    countries: ['ES', 'MX', 'MX', 'AR', 'CO', 'CL', 'BR'],
  },
  nigeria: {
    m: ['Chidi', 'Tunde', 'Emeka', 'Femi', 'Obinna', 'Seun', 'Kelechi', 'Dayo', 'Ikenna', 'Tobi'],
    f: ['Adaeze', 'Funmi', 'Chiamaka', 'Ifeoma', 'Temi', 'Ngozi', 'Zainab', 'Bisola', 'Amaka', 'Kemi'],
    last: ['Okafor', 'Adeyemi', 'Eze', 'Balogun', 'Nwosu', 'Okonkwo', 'Adebayo', 'Obi', 'Afolabi', 'Chukwu', 'Ogunleye', 'Ibekwe', 'Oyelaran', 'Uche', 'Bello'],
    countries: ['NG', 'NG', 'GH'],
  },
};

const BANK_WEIGHTS: [string, number][] = [
  ['anglo', 42], ['india', 12], ['pakistan', 4], ['korea', 7], ['china', 7], ['japan', 5], ['french', 6], ['hispanic', 10], ['nigeria', 7],
];

export function fictionalName(r: RNG, gender: Gender, used?: Set<string>): { name: string; nationality: string } {
  for (let i = 0; i < 20; i++) {
    const bankId = r.weighted(BANK_WEIGHTS, ([, w]) => w)[0];
    const b = BANKS[bankId];
    const first = r.pick(gender === 'F' ? b.f : gender === 'M' ? b.m : r.chance(0.5) ? b.f : b.m);
    const last = r.pick(b.last);
    const name = bankId === 'china' || bankId === 'korea' ? `${first} ${last}` : `${first} ${last}`;
    if (used && used.has(name)) continue;
    used?.add(name);
    return { name, nationality: r.pick(b.countries) };
  }
  const bankId = r.weighted(BANK_WEIGHTS, ([, w]) => w)[0];
  const b = BANKS[bankId];
  const first = r.pick(gender === 'F' ? b.f : b.m);
  const initial = String.fromCharCode(65 + r.int(0, 25));
  const name = bankId === 'anglo' || bankId === 'nigeria' || bankId === 'hispanic' ? `${first} ${initial}. ${r.pick(b.last)}` : `${first} ${r.pick(b.last)} ${r.pick(b.last)}`;
  if (used?.has(name)) return { name: `${name} Jr.`, nationality: r.pick(b.countries) };
  used?.add(name);
  return { name, nationality: r.pick(b.countries) };
}

export const CRITICS = ['Mara Kessler', 'Desmond Vail', 'Priya Lantern', 'Otto Brandt', 'Celia Moreau', 'Jun Okabe', 'Rafe Dalton', 'Nadia Ferro', 'Hollis Grant', 'Imani Cole', 'Lev Arkin', 'Bea Tolliver'];
export const OUTLETS = ['The Daily Reel', 'Screenline', 'Celluloid Weekly', 'The Marquee Post', 'Frame Rate', 'Projector Magazine', 'Sightlines', 'The Grand Balcony', 'Reel Talk Review', 'Final Cut Quarterly', 'The Matinee', 'Popcorn Ledger'];
