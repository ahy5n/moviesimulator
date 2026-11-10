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
  languages: string[]; // ISO 639-1 codes, home language first
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
  language?: string; // defaults to English for older saves
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
  facility?: { saving: number; quality: number }; // locked in at greenlight from your studio lot
  acquiredAt?: string; // festival id if bought at a festival market
  campaign?: CampaignItem[]; // release campaign extras on top of P&A
  tracking?: { t: number; low: number; high: number }[]; // pre-release opening-weekend tracking (player films)
  previews?: number; // Thursday-night previews
  spinoffOf?: string; // series this film was spun out of
  boughtFrom?: string; // studio id, when you bought the rights from a rival
};

export type CampaignItem = 'trailer' | 'premiere' | 'tour' | 'tvblitz' | 'social';

// ---------- TV ----------

export const SERIES_FORMATS = ['Drama', 'Limited', 'Sitcom', 'Procedural', 'Anthology', 'Docuseries', 'Animated', 'Soap'] as const;
export type SeriesFormat = (typeof SERIES_FORMATS)[number];

export type SeriesStage = 'development' | 'pitching' | 'preproduction' | 'filming' | 'post' | 'airing' | 'between' | 'ended' | 'cancelled';

/** A channel's offer: guaranteed seasons, plus options the channel may pick up if ratings are good. */
export type SeriesOffer = { id: string; channelId: string; guaranteed: number; options: number; feePerEp: number; expires: number; renewal?: boolean; note: string };

export type SeriesContract = { channelId: string; guaranteedLeft: number; optionsLeft: number; feePerEp: number; signedT: number };

export type SeasonResult = {
  n: number; quality: number; critic: number; audience: number; viewers: number; // avg millions per episode
  pull?: number; // subscribers it pulled to your own service
  episodes: number; airedFrom: number; feePerEp: number; outcome?: 'renewed' | 'picked up' | 'cancelled' | 'ended' | 'offered renewal';
};

export type SeriesRegular = { talentId: string; role: 'lead' | 'support'; feePerEp: number };

export type Series = {
  id: string; title: string; logline: string; studioId: string;
  format: SeriesFormat; primaryGenre: Genre; secondaryGenre?: Genre; tone: Tone; language: string;
  episodes: number; runtime: 30 | 45 | 60; budgetPerEp: number;
  writerId: string; scriptQuality: number; scriptRange: [number, number];
  stage: SeriesStage; stageTurnsLeft: number; createdT: number;
  season: number; // seasons started (0 before the first)
  regulars: SeriesRegular[]; leads: number; supports: number;
  offers: SeriesOffer[]; pitchedT?: number; pitchCooldown?: number;
  contract?: SeriesContract; ownService?: boolean;
  seasons: SeasonResult[];
  current?: { quality: number; viewers: number[]; aired: number; critic: number; audience: number };
  spent: number; revenue: number; syndicated?: boolean; events: string[]; luck: number;
  awards?: AwardResult[]; fyc?: Record<string, number>; buzz?: number;
  lastSeasonStartT?: number; // seasons come round about once a year
  spinoffOf?: string; // film or series id this was spun out of
  franchiseId?: string;
};

export type Script = {
  id: string; title: string; logline: string;
  primaryGenre: Genre; secondaryGenre?: Genre; tone: Tone; language?: string;
  quality: number; low: number; high: number; coverage: boolean;
  suggestedBudget: number; tier: BudgetTier; leads: number; supports: number;
  writerId: string; price: number; expires: number;
  source: 'market' | 'original' | 'ip' | 'sequel';
  ipId?: string; sequelOf?: string; franchiseId?: string;
  dealBy?: string; // pitched to you by someone on a first-look or overall deal
};

export type IP = {
  id: string; title: string; kind: 'Novel' | 'Video game' | 'Comic' | 'Remake';
  genres: [Genre, Genre?]; buzz: number; price: number; owner?: string; used?: boolean;
};

export type Franchise = {
  id: string; name: string; studioId: string; filmIds: string[];
  heat: number; fatigue: number; isUniverse: boolean;
  licences?: Licence[]; merchTotal?: number;
  legacyGross?: number; legacyFilms?: number; // films made before the game starts
  genre?: Genre;
};

export type LicenceKind = 'toys' | 'game' | 'park';
export type Licence = { kind: LicenceKind; signedT: number; readyT: number; live: boolean; earned: number };

// ---------- Festival acquisitions ----------

export type Acquisition = {
  id: string; festivalId: string; year: number; opensT: number; closesT: number;
  title: string; logline: string; primaryGenre: Genre; secondaryGenre?: Genre; tone: Tone; language: string;
  budget: number; quality: number; screened: [number, number]; reception: number;
  directorId: string; writerId: string; cast: string[];
  reserve: number; bid: number; leader?: string; // leader is a studio id
  rivalMax: Record<string, number>; // private valuations
  status: 'open' | 'sold' | 'passed'; filmId?: string; log: { studioId: string; amount: number }[];
};

// ---------- Overall & first-look deals ----------

export type DealKind = 'first-look' | 'overall';
export type Deal = {
  id: string; talentId: string; studioId: string; kind: DealKind; fromT: number; untilT: number;
  perTurn: number; nextPitchT: number; poach?: { studioId: string; raise: number; expires: number };
};

// ---------- Studio lot ----------

export type FacilityId = 'stages' | 'vfx' | 'animation' | 'post';
export type FacilityState = { level: number; readyT: number };

// ---------- Industry shocks ----------

export type ShockKind = 'writers' | 'actors' | 'recession';
export type Shock = { kind: ShockKind; announcedT: number; startT: number; endT: number };

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
  adTier?: boolean;
  licensed?: LicensedTitle[];
};

/** A rival's film or series licensed onto your service for a while. */
export type LicensedTitle = { id: string; kind: 'film' | 'series'; title: string; from: string; untilT: number; pull: number };

export type Package = {
  id: string; agencyId: string; expires: number; title: string; logline: string; primaryGenre: Genre; secondaryGenre?: Genre; tone: Tone; language: string;
  tier: BudgetTier; budget: number; scriptQuality: number; writerId: string; directorId: string; actorIds: string[]; fees: number; discount: number;
};

export type LibrarySale = { id: string; studioId: string; filmIds: string[]; price: number; expires: number };

export type Scenario = { id: string; startT: number; deadlineT: number; status: 'active' | 'won' | 'lost' };

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
  boss?: string; bossSince?: number; distressUntil?: number;
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

/** A nominee is a film, or a TV series when seriesId is set (filmId is then empty). */
export type Nominee = { filmId: string; seriesId?: string; season?: number; talentId?: string; studioId: string; score: number };
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
  series?: Series[];
  /** Your reputation as a producer. Follows you to every studio. */
  producer?: { reputation: number };
  acquisitions?: Acquisition[];
  deals?: Deal[];
  facilities?: Partial<Record<FacilityId, FacilityState>>;
  shocks?: Shock[]; // newest last; past ones kept for the history
  nextShockT?: number;
  scenario?: Scenario;
  achievements?: Record<string, number>; // id -> turn unlocked
  agencies?: Record<string, { rel: number; blacklistUntil?: number }>;
  packages?: Package[];
  relations?: Record<string, number>; // pairKey -> -10..10, built from working together
  librarySales?: LibrarySale[];
  rightsCooldown?: Record<string, number>; // item id -> turn they'll talk again
  idCounter: number;
  stats: { biddingWars: number; sacked: number; tripleAir?: number };
};
