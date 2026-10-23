// Core game types. Time is measured in absolute fortnight turns: t = 0 is 1–14 Jan 2026.

export const GENRES = [
  'Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi', 'Romance', 'Thriller', 'Animation',
  'Fantasy', 'Superhero', 'Musical', 'War', 'Western', 'Crime', 'Documentary', 'Family',
] as const;
export type Genre = (typeof GENRES)[number];

export const MARKETS = ['US', 'UK', 'EU', 'CN', 'IN', 'JP', 'KR', 'LATAM', 'ME', 'ROW'] as const;
export type Market = (typeof MARKETS)[number];

export const TRAITS = [
  'Reliable', 'Diva', 'Method', 'Workaholic', 'Team Player', 'Prankster', 'Perfectionist', 'Loyal', 'Picky',
] as const;
export type Trait = (typeof TRAITS)[number];

export type Tone = 'light' | 'balanced' | 'dark';
export type BudgetTier = 'Micro' | 'Low' | 'Mid' | 'High' | 'Tentpole';
export type TalentKind = 'actor' | 'director' | 'writer' | 'composer' | 'cinematographer' | 'editor';
export type CrewRole = 'director' | 'writer' | 'composer' | 'cinematographer' | 'editor';
export type Gender = 'M' | 'F' | 'X';

export type Attrs = {
  starPower: number; acting: number; boxOffice: number; range: number;
  chemistry: number; reliability: number; experience: number; overall: number;
};

export type Credit = { title: string; year: number; billing: number; inGame?: boolean; filmId?: string };

export type Talent = {
  id: string; tmdbId?: number; name: string; isFictional: boolean; kind: TalentKind;
  birthDate: string; gender: Gender; nationality: string; // ISO-3166 alpha-2
  attrs: Attrs;
  genres: Record<Genre, number>;
  regional: Record<Market, number>;
  traits: Trait[]; potential: number;
  fee: number; backendDemand: number;
  credits: Credit[];
  debutYear?: number;
};

/** Mutable career state layered on top of the read-only database. Only changed people appear. */
export type TalentOverride = {
  star?: number; acting?: number; box?: number; // additive deltas
  feeMult?: number;
  retired?: boolean;
  breakUntil?: number;
  walkedUntil?: number;
  loyalty?: Record<string, number>; // studioId -> loyalty points (films together, awards won together)
  producer?: number; // loyalty to you personally; follows you between studios
  credits?: Credit[]; // in-game credits
  lastHitT?: number;
};

export type Stage = 'development' | 'preproduction' | 'filming' | 'post' | 'ready' | 'released' | 'library' | 'shelved';
export type ReleaseType = 'theatrical' | 'streaming' | 'sold' | 'dayanddate';
export type ScreenPlan = 'limited' | 'moderate' | 'wide' | 'ultra';

export type CastSlot = {
  talentId: string; role: 'lead' | 'support'; fee: number; backend: number; billing: number; options: number;
};

export type Review = { outlet: string; critic: string; score: number; quote: string };

export type AwardResult = { year: number; body: string; category: string; talentId?: string; won: boolean };

export type Film = {
  id: string; title: string; studioId: string; logline: string;
  primaryGenre: Genre; secondaryGenre?: Genre; tone: Tone;
  stage: Stage; stageTurnsLeft: number; createdT: number;
  budget: number; tier: BudgetTier; suggestedBudget: number; marketing: number;
  scriptQuality: number; scriptRange?: [number, number]; quality: number; qualityKnown: boolean; testRange?: [number, number];
  leads: number; supports: number;
  cast: CastSlot[];
  crew: Partial<Record<CrewRole, { talentId: string; fee: number }>>;
  release?: { type: ReleaseType; t: number; screens: ScreenPlan; markets: Market[] };
  weekly: number[]; // worldwide gross per week
  byMarket: Partial<Record<Market, number>>;
  weeklyByMarket?: Partial<Record<Market, number[]>>; // player films only
  gross: number; studioRevenue: number; otherRevenue: number; spent: number;
  backendPaid: number;
  critic?: number; audience?: number; reviews?: Review[];
  franchiseId?: string; sequelOf?: string; ipId?: string; ipBuzz?: number;
  awards: AwardResult[]; fyc: Record<string, number>;
  festival?: { id: string; year: number; reception: number };
  events: string[];
  luck: number; buzz: number;
  inTheatres: boolean; weeksOut: number;
  chinaBlocked?: boolean;
  salePrice?: number; soldTo?: string;
  cofinance?: { partner: string; share: number };
  homeWindowT?: number; libraryValue?: number;
  isSeries?: false;
  overrun?: number;
  prodPaid?: number;
  openByMarket?: Partial<Record<Market, number>>;
};

export type Script = {
  id: string; title: string; logline: string;
  primaryGenre: Genre; secondaryGenre?: Genre; tone: Tone;
  quality: number; low: number; high: number; coverage: boolean;
  suggestedBudget: number; tier: BudgetTier; leads: number; supports: number;
  writerId: string; price: number; expires: number;
  source: 'market' | 'original' | 'ip' | 'sequel';
  ipId?: string; sequelOf?: string; franchiseId?: string;
};

export type IP = {
  id: string; title: string; kind: 'Novel' | 'Video game' | 'Comic' | 'Remake';
  genres: [Genre, Genre?]; buzz: number; price: number; owner?: string; used?: boolean;
};

export type Franchise = {
  id: string; name: string; studioId: string; filmIds: string[];
  heat: number; fatigue: number; isUniverse: boolean;
};

export type Negotiation = {
  talentId: string; filmId: string; role: 'lead' | 'support' | CrewRole;
  round: number; asking: number;
  history: { from: 'you' | 'agent'; fee: number; backend: number; billing: number; options: number; note: string }[];
  status: 'open' | 'accepted' | 'walked' | 'rejected';
};

export type BiddingWar = {
  id: string; talentId: string; filmId: string; role: 'lead' | 'support' | CrewRole;
  asking: number; current: number; leader: string;
  bidders: { studioId: string; max: number; out: boolean }[];
  log: { studioId: string; amount: number }[];
  done: boolean; winner?: string;
};

export type StreamingService = {
  name: string; launchedT: number; subscribers: number; price: number; churn: number;
  libraryValue: number; history: { t: number; subs: number; revenue: number }[];
  exclusivesBoost: number;
};

export type StudioPersonality = {
  slate: number; genres: Partial<Record<Genre, number>>; risk: number; prestige: number;
  budgetBias: BudgetTier[]; streamingFirst: number; regions: Partial<Record<Market, number>>;
  aggression: number;
};

export type Studio = {
  id: string; name: string; color: string; initials: string; hq: string;
  cash: number; prestige: number; isPlayer: boolean;
  personality?: StudioPersonality;
  streaming?: StreamingService;
  rivalSubs?: number; streamName?: string;
};

export type BoardTarget = {
  kind: 'profit' | 'bpNoms' | 'marketShare' | 'streamingSubs' | 'hits';
  value: number; label: string; met?: boolean;
};
export type Board = {
  confidence: number; year: number; targets: BoardTarget[]; history: { year: number; confidence: number; met: number; total: number }[];
  loyalty?: number; // this board's loyalty to you; softens bad news, can save your job once
  reprieveUsed?: boolean;
};

export type Loan = { id: string; principal: number; balance: number; rate: number; payment: number; turnsLeft: number };

export type MessageKind = 'news' | 'agent' | 'rival' | 'board' | 'awards' | 'event' | 'finance' | 'offer';
export type Message = {
  id: string; t: number; kind: MessageKind; title: string; body: string; read: boolean;
  link?: string; filmId?: string;
  offer?: { type: 'streamerBuy'; filmId: string; amount: number; buyer: string; expires: number };
};

export type Nominee = { filmId: string; talentId?: string; studioId: string; score: number };
export type Ceremony = {
  id: string; body: string; year: number; t: number;
  categories: { name: string; nominees: Nominee[]; winner: number }[];
  viewed: boolean;
};

export type FestivalEntry = { festivalId: string; filmId: string; year: number };

export type TurnSummary = {
  t: number; cashStart: number; cashEnd: number;
  income: Record<string, number>; expenses: Record<string, number>;
  headlines: string[];
};

export type YearSummary = {
  year: number; released: number; gross: number; revenue: number; costs: number; profit: number;
  marketShare: number; rank: number; noms: number; wins: number; bestPictures: number;
  subs: number; studioName: string;
};

export type GameSettings = {
  difficulty: 'easy' | 'hard'; crewMode: 'standard' | 'full';
  startBudget: 'indie' | 'minimajor' | 'major';
};

/** A fictional studio that offers a fired player a new job. */
export type JobOffer = { id: string; name: string; color: string; initials: string; hq: string; cash: number; prestige: number; tier: GameSettings['startBudget']; pitch: string };

export type GameState = {
  version: 1; seed: string; slot: string; createdAt: number; savedAt: number;
  t: number; settings: GameSettings;
  studio: Studio; rivals: Studio[];
  films: Film[];
  scripts: Script[]; // marketplace
  ips: IP[];
  franchises: Franchise[];
  talentOverrides: Record<string, TalentOverride>;
  newTalent: Talent[];
  commitments: Record<string, { filmId: string; studioId: string; until: number }>;
  negotiations: Record<string, Negotiation>;
  biddingWar?: BiddingWar;
  genreHeat: Record<Genre, number>;
  board?: Board;
  loans: Loan[];
  inbox: Message[];
  ceremonies: Ceremony[];
  festivalEntries: FestivalEntry[];
  history: YearSummary[];
  ledger: Record<number, Record<string, number>>; // year -> category -> amount (+ income, - cost)
  lastSummary?: TurnSummary;
  bailoutUsed: boolean;
  gameOver?: { reason: string; t: number };
  sacked?: { t: number; offers: JobOffer[] };
  jobHistory: { studioName: string; fromT: number; toT?: number }[];
  /** Your reputation as a producer. Follows you to every studio. */
  producer?: { reputation: number };
  idCounter: number;
  stats: { biddingWars: number; sacked: number };
};
