export const WORLD_ID = "cihan";
export const START_YEAR = 1453;
export const STATE_VERSION = 14;

export type Locale = "tr" | "en";

export type TraitId =
  | "adalet"
  | "cesaret"
  | "ilim"
  | "siyaset"
  | "comertlik"
  | "zahid";

export type Education = "seyfiye" | "kalemiye" | "ilmiye";
export type Focus = "fatih" | "kanuni" | "hunkar";
export type Office =
  | "sadrazam"
  | "seyhulislam"
  | "kaptan"
  | "defterdar"
  | "nisanci"
  | "kazasker_rumeli"
  | "kazasker_anadolu"
  | "yeniceri_agasi"
  | "kubbe_vezir"
  | "beylerbeyi"
  | "reisulkuttab"
  | "valide"
  | "musahib";
export type TroopKind = "janissary" | "sipahi" | "azab" | "akinji" | "topcu" | "navy" | "levend";
export type Terrain = "plain" | "hill" | "mountain" | "coast" | "forest" | "desert" | "urban" | "island";
export type SeasonWeather = "fair" | "rain" | "snow" | "heat" | "storm";
export type CampaignPhase = "march" | "siege" | "field" | "retreat" | "naval";
export type DoctrineId = "hold" | "sally" | "scorch" | "negotiate" | "ambush";
export type TacticId = "center" | "flank" | "artillery" | "cavalry_charge" | "hold_line" | "feint" | "withdraw";
export type BattleKind = "field" | "siege" | "naval" | "raid" | "duel";
export type BattleResult = "win" | "loss" | "stalemate" | "retreat";
export type SiegeActionId = "bombard" | "sap" | "starve" | "storm" | "wait";
export type SiegePhase = "invest" | "breach" | "assault" | "resolved";
export type SiegeOutcome = "captured" | "surrender" | "starved" | "repulsed" | "abandoned";
export type CinemaBeat = "march" | "guns" | "walls" | "cavalry" | "commander" | "victory" | "defeat";
export type Treaty = "peace" | "truce" | "alliance" | "war";
export type HistoryLane = "canon" | "player";
export type CanonKind = "context" | "conquest" | "failed_siege" | "treaty" | "succession" | "battle" | "campaign";
export type DivergenceKind = "early" | "late" | "missed" | "contrary" | "alt";
export type PlayerHistoryKind =
  | "coronation"
  | "conquest"
  | "loss"
  | "campaign"
  | "campaign_failed"
  | "treaty"
  | "succession";
export type CrisisKind =
  | "revolt"
  | "janissary"
  | "palace"
  | "rivalry"
  | "spy"
  | "agent"
  | "economy"
  | "claim"
  | "diplomatic"
  | "commander";
export type DipKind = "envoy" | "peace" | "alliance" | "trade" | "war" | "coalition";
export type SeatKind = "ai" | "player";
export type OfferStatus = "pending" | "accepted" | "refused" | "expired" | "withdrawn";
export type MessageStatus = "sent" | "read" | "flagged" | "hidden";
export type Building = "cami" | "medrese" | "kervansaray" | "tersane" | "hisar";
export type PortClass = "none" | "harbor" | "arsenal";
export type DebtHolder = "galata" | "ulema_vakif" | "timar";
export type MemberRole = "sultan" | "valide" | "hatun" | "sehzade" | "sultan_kizi" | "akraba";
export type ViewId =
  | "saray"
  | "divan"
  | "hazine"
  | "ordu"
  | "harita"
  | "diplomasi"
  | "hanedan"
  | "tarih"
  | "cihan"
  | "bazaar";

export type PortraitKey =
  | "sultan-a"
  | "sultan-b"
  | "sultan-c"
  | "valide"
  | "vizier"
  | "sehzade"
  | "kaptan"
  | "ulema"
  | "hatun"
  | "hatun-b";

export type ExpressionId = "idle" | "speak" | "stern" | "weary" | "warm";
export type AgeBand = "young" | "prime" | "mature" | "elder";
export type Regalia = "ceremonial" | "divan" | "private" | "garden" | "campaign";
export type Constitution = "saglam" | "dinc" | "yorgun" | "zayif";
export type TemperId = "sogukkanli" | "atesli" | "tedbirli" | "comert" | "supheli";

export type Origin = "devsirme" | "ulema" | "askeri" | "kalemiye" | "kapikulu" | "hanedan";
export type FactionId = "divan" | "ocak" | "ulema" | "hazine" | "derya" | "eyalet" | "harem";
export type DivanTopic = "savas" | "ekonomi" | "isyan" | "diplomasi" | "sehir" | "ticaret" | "ordu" | "hanedan";
export type DivanStance = "support" | "oppose" | "caution";

export type PalaceRoomId =
  | "taht"
  | "divan"
  | "harem"
  | "hazine"
  | "hasoda"
  | "bahce"
  | "elci"
  | "sehzade"
  | "askeri";

export type AudienceTopic = "hal" | "nasihat" | "sir" | "dilek";

export type HaremRank = "valide" | "haseki" | "kadin" | "ikbal" | "cariye" | "none";
export type BondStage =
  | "none"
  | "acquaintance"
  | "courtship"
  | "kiss"
  | "private"
  | "marriage"
  | "halvet"
  | "family";
export type BondAction = "meet" | "court" | "kiss" | "private_time" | "marry" | "halvet";
export type IntimateStep = "kiss" | "closeness" | "chamber" | "veiled" | "fade" | "aftermath";

export interface FaceDna {
  complexion: string;
  eyes: string;
  brows: string;
  beard: string;
  bone: string;
  marks: string;
}

export interface CharacterIdentity {
  archetypeId: PortraitKey;
  givenName: string;
  face: FaceDna;
  lockedAtYear: number;
}

export interface HealthFlags {
  vigor: number;
  fatigue: number;
  constitution: Constitution;
}

export interface Reputation {
  court: number;
  people: number;
  ulema: number;
  army: number;
}

export interface Authority {
  divan: number;
  army: number;
  harem: number;
  ulema: number;
}

export interface Personality {
  temper: TemperId;
  traits: TraitId[];
}

export interface DecisionRecord {
  id: string;
  year: number;
  kind: string;
  titleKey: string;
  choiceId?: string;
  room?: PalaceRoomId;
}

export interface CourtTie {
  targetId: string;
  kind: "npc" | "member";
  affinity: number;
  trust: number;
  lastMetYear: number;
}

export interface PalaceOccupant {
  characterId: string;
  kind: "ruler" | "npc" | "member";
  room: PalaceRoomId;
}

export interface PalaceState {
  currentRoom: PalaceRoomId;
  occupants: PalaceOccupant[];
  seenCinematics: string[];
}

export interface HaremBond {
  id: string;
  partnerId: string;
  stage: BondStage;
  warmth: number;
  consent: boolean;
  lastYear: number;
  married: boolean;
}

export interface IntimateScene {
  partnerId: string;
  act: BondAction;
  step: IntimateStep;
}

export interface HaremState {
  bonds: HaremBond[];
  favoriteId: string | null;
  intrigue: number;
  lastHalvetYear: number;
  lastIntroduceYear: number;
  lastBirthYear: number;
  scene: IntimateScene | null;
}

export interface RulerStats {
  adalet: number;
  cesaret: number;
  ilim: number;
  siyaset: number;
}

export interface DynastyMember {
  id: string;
  givenName: string;
  gender: "m" | "f";
  role: MemberRole;
  birthYear: number;
  deathYear: number | null;
  fatherId: string | null;
  motherId: string | null;
  education: Education | null;
  location: string;
  alive: boolean;
  stats: RulerStats;
  portrait: PortraitKey;
  temper: TemperId;
  haremRank: HaremRank;
  spouseId: string | null;
  military: number;
  statecraft: number;
  influence: number;
  supporters: string[];
  generation: number;
}

export interface Ruler {
  id: string;
  memberId: string;
  givenName: string;
  title: string;
  dynastyName: string;
  gender: "m" | "f";
  birthYear: number;
  health: number;
  traits: TraitId[];
  stats: RulerStats;
  portrait: PortraitKey;
  reignStart: number;
  identity: CharacterIdentity;
  clothing: Regalia;
  healthFlags: HealthFlags;
  reputation: Reputation;
  authority: Authority;
  personality: Personality;
}

export interface CourtPost {
  id: string;
  office: Office;
  npcId: string | null;
  seat?: number;
  regionId?: string;
}

export interface Npc {
  id: string;
  name: string;
  office: Office;
  loyalty: number;
  competence: number;
  portrait: PortraitKey;
  alive: boolean;
  influence: number;
  wealth: number;
  favor: number;
  ambition: number;
  origin: Origin;
  faction: FactionId;
  rivals: string[];
  allies: string[];
  tenureStart: number;
  birthYear: number;
  seat?: number;
  regionId?: string;
}

export interface DivanVote {
  npcId: string;
  stance: DivanStance;
}

export interface DivanItem {
  id: string;
  key: string;
  topic: DivanTopic;
  year: number;
  proposedBy: string;
  titleKey: string;
  bodyKey: string;
  payload: Record<string, string>;
  votes: DivanVote[];
}

export interface DivanMinute {
  id: string;
  year: number;
  itemKey: string;
  topic: DivanTopic;
  choiceId: string;
  titleKey: string;
  deferred?: boolean;
}

export interface DivanState {
  sessionOpen: boolean;
  agenda: DivanItem[];
  minutes: DivanMinute[];
  lastConvenedYear: number;
}

export interface ClaimPower {
  court: number;
  army: number;
  people: number;
  province: number;
  talent: number;
  blood: number;
}

export interface Pretender {
  memberId: string;
  name: string;
  portrait: PortraitKey;
  birthYear: number;
  generation: number;
  claim: ClaimPower;
  strength: number;
  backers: string[];
  location: string;
  motherId: string | null;
  fatherId: string | null;
}

export interface SuccessionState {
  deceasedName: string;
  deceasedMemberId: string;
  heirMemberId: string;
  heirName: string;
  pretenders: Pretender[];
  phase: "open" | "chosen";
  tension: number;
  yearOpened: number;
}

export interface RealmSnapshot {
  year: number;
  treasury: number;
  stability: number;
  prestige: number;
  piety: number;
  army: {
    janissary: number;
    sipahi: number;
    azab: number;
    akinji: number;
    topcu: number;
    navy: number;
    levend: number;
    morale: number;
  };
  provincesOwned: number;
  wars: string[];
  friends: string[];
  enemies: string[];
  treaties: { realmId: string; treaty: Treaty; value: number }[];
  debt: number;
}

export interface ReignRecord {
  id: string;
  ordinal: number;
  memberId: string;
  givenName: string;
  portrait: PortraitKey;
  identity: CharacterIdentity;
  startYear: number;
  endYear: number | null;
  deathAge: number | null;
  snapshotStart: RealmSnapshot;
  snapshotEnd: RealmSnapshot | null;
  warsWon: number;
  warsLost: number;
  provincesGained: number;
  provincesLost: number;
  buildingsRaised: number;
  heirName: string | null;
  generation: number;
}

export interface Province {
  id: string;
  nameKey: string;
  region: string;
  x: number;
  y: number;
  ownerId: string;
  development: number;
  manpower: number;
  taxBase: number;
  loyalty: number;
  religion: string;
  culture: string;
  fort: number;
  neighbors: string[];
  agriculture: number;
  production: number;
  trade: number;
  customs: number;
  port: PortClass;
  grain: number;
  prosperity: number;
  unrest: number;
}

export interface Army {
  janissary: number;
  sipahi: number;
  azab: number;
  akinji: number;
  topcu: number;
  navy: number;
  levend: number;
  morale: number;
  provinceId: string;
  status: "idle" | "campaign" | "garrison" | "siege" | "retreat";
  drill: number;
  experience: number;
  supply: number;
  pay: number;
  commanderNpcId: string | null;
  commanderMemberId: string | null;
}

export interface CampaignOp {
  targetProvinceId: string;
  startYear: number;
  progress: number;
  route: string[];
  routeIndex: number;
  phase: CampaignPhase;
  siegeProgress: number;
  weather: SeasonWeather;
  lastReportId: string | null;
}

export interface BattleReport {
  id: string;
  year: number;
  kind: BattleKind;
  provinceId: string;
  result: BattleResult;
  atkPower: number;
  defPower: number;
  tacticAtk: TacticId;
  tacticDef: TacticId;
  factors: string[];
  lossesAtk: Partial<Record<TroopKind, number>>;
  lossesDef: number;
}

export interface FortDefense {
  walls: number;
  gates: number;
  defense: number;
  garrison: number;
  provisions: number;
  morale: number;
}

export interface SiegeHost {
  artillery: number;
  preparation: number;
  supply: number;
  men: number;
  commanderScore: number;
}

export interface SiegeLogEntry {
  id: string;
  year: number;
  action: SiegeActionId;
  noteKey: string;
  vars: Record<string, string | number>;
}

export interface SiegeCinema {
  outcome: SiegeOutcome;
  beats: CinemaBeat[];
  index: number;
  provinceId: string;
  year: number;
  atkPower: number;
  defPower: number;
}

export interface SiegeState {
  provinceId: string;
  yearOpened: number;
  ticks: number;
  phase: SiegePhase;
  defense: FortDefense;
  host: SiegeHost;
  lastAction: SiegeActionId | null;
  outcome: SiegeOutcome | null;
  cinema: SiegeCinema | null;
  log: SiegeLogEntry[];
  atkPower: number;
  defPower: number;
}

export interface TacticalDuel {
  id: string;
  peerId: string;
  peerName: string;
  provinceId: string;
  phase: "offer" | "live" | "resolved";
  selfTactic: TacticId | null;
  foeTactic: TacticId | null;
  seed: number;
  host: boolean;
}

export interface MilitaryState {
  doctrine: DoctrineId;
  liveOrders: TacticId;
  lastDrillYear: number;
  lastPayYear: number;
  battles: BattleReport[];
  pendingDuel: TacticalDuel | null;
}

export interface Realm {
  id: string;
  name: string;
  adjective: string;
  capitalId: string;
  color: string;
  religion: string;
  culture: string;
  isPlayer: boolean;
  aiKey?: string;
}

export interface Relation {
  realmId: string;
  value: number;
  treaty: Treaty;
  tradePact: boolean;
  coalitionAgainst: string | null;
}

export interface DipTerms {
  tribute: number;
  durationYears: number;
  againstRealmId: string | null;
  note: string;
}

export interface DipOffer {
  id: string;
  fromSeat: string;
  toSeat: string;
  kind: DipKind;
  terms: DipTerms;
  status: OfferStatus;
  year: number;
  fromRuler: string;
  fromRealm: string;
}

export interface SeatClaim {
  realmId: string;
  kind: SeatKind;
  userId: string | null;
  campaignId: string | null;
  rulerName: string;
  realmName: string;
  live: boolean;
  claimable: boolean;
}

export interface DiplomacyState {
  seatId: string;
  seats: SeatClaim[];
  pending: DipOffer[];
}

export type AttackEdict = "defend_walls" | "sally" | "ask";
export type OffensiveEdict = "never" | "hold_campaign";
export type PeaceEdict = "ask" | "accept_if_losing" | "refuse";
export type FamineEdict = "relief" | "ask" | "endure";
export type UlufeEdict = "pay" | "ask" | "refuse";
export type DebtEdict = "no_borrow" | "borrow_if_empty" | "ask";
export type TaxEdict = "hold" | "ease_if_unrest";
export type TradeEdict = "accept_friends" | "ask" | "refuse";
export type WarOfferEdict = "ask" | "refuse";
export type WorksEdict = "none" | "caravan";
export type PauseReason = "event" | "succession" | "peace" | "attack" | "revolt" | "duel" | "war_offer" | "harem" | "speed" | null;
export type NoticeSeverity = "info" | "critical";
export type WorldJobKind = "year_tick" | "campaign_step" | "work_complete" | "dip_expire" | "notice";
export type WorldJobStatus = "queued" | "done" | "failed";

export interface StandingEdicts {
  onAttack: AttackEdict;
  offensive: OffensiveEdict;
  peace: PeaceEdict;
  famine: FamineEdict;
  ulufe: UlufeEdict;
  debt: DebtEdict;
  tax: TaxEdict;
  trade: TradeEdict;
  warOffer: WarOfferEdict;
  works: WorksEdict;
}

export interface WorkProject {
  id: string;
  building: Building;
  startedYear: number;
  etaYear: number;
  costPaid: number;
}

export interface WorldNotice {
  id: string;
  year: number;
  kind: string;
  severity: NoticeSeverity;
  titleKey: string;
  bodyKey: string;
  vars: Record<string, string | number>;
  read: boolean;
  at: number;
}

export interface CatchupBeat {
  year: number;
  kind: string;
  titleKey: string;
}

export interface WorldClockState {
  lastSimAt: number;
  msPerYear: number;
  paused: boolean;
  pauseReason: PauseReason;
  edicts: StandingEdicts;
  works: WorkProject[];
  notices: WorldNotice[];
  digest: CatchupBeat[];
  yearsSimulated: number;
}

export interface WorldJob {
  id: string;
  worldId: string;
  campaignId: string | null;
  userId: string | null;
  kind: WorldJobKind;
  dueAt: number;
  payload: Record<string, string | number>;
  status: WorldJobStatus;
}

export interface PendingEvent {
  id: string;
  key: string;
  year: number;
  payload: Record<string, string>;
}

export interface ChronicleEntry {
  id: string;
  year: number;
  kind: string;
  titleKey: string;
  bodyKey: string;
  vars: Record<string, string | number>;
}

export interface LedgerEntry {
  id: string;
  year: number;
  kind: string;
  amount: number;
  noteKey: string;
}

export interface Buildings {
  cami: number;
  medrese: number;
  kervansaray: number;
  tersane: number;
  hisar: number;
}

export interface PeoplePulse {
  prosperity: number;
  peace: number;
  taxPressure: number;
  foodAccess: number;
  allegiance: number;
}

export interface BudgetLine {
  key: string;
  amount: number;
}

export interface ProvinceYield {
  id: string;
  tax: number;
  agriculture: number;
  production: number;
  trade: number;
  customs: number;
  port: number;
  total: number;
}

export interface YearBudget {
  year: number;
  income: BudgetLine[];
  expense: BudgetLine[];
  totalIncome: number;
  totalExpense: number;
  net: number;
  interest: number;
  campaign: number;
  provinces: ProvinceYield[];
}

export interface Loan {
  id: string;
  holder: DebtHolder;
  principal: number;
  rate: number;
  yearOpened: number;
}

export interface EconomyState {
  tariffRate: number;
  grainReserve: number;
  loans: Loan[];
  lastBudget: YearBudget | null;
  people: PeoplePulse;
  lastReliefYear: number;
  famineStreak: number;
  revoltRisk: number;
  unpaidStreak: number;
}

export interface HistorySource {
  id: string;
  work: string;
  author: string;
  year: number;
  locator?: string;
}

export interface CanonFact {
  id: string;
  year: number;
  kind: CanonKind;
  titleKey: string;
  bodyKey: string;
  provinceId?: string;
  realmId?: string;
  ownerSeatId?: string;
  actorSeatId?: string;
  treaty?: Treaty;
  successorName?: string;
  sources: string[];
  starting?: boolean;
}

export interface PlayerHistoryEvent {
  id: string;
  year: number;
  kind: PlayerHistoryKind;
  titleKey: string;
  bodyKey: string;
  vars: Record<string, string | number>;
  provinceId?: string;
  realmId?: string;
  treaty?: Treaty;
  successorName?: string;
  canonId?: string | null;
}

export interface HistoryDivergence {
  id: string;
  year: number;
  kind: DivergenceKind;
  canonId: string;
  playerEventId?: string;
  titleKey: string;
  bodyKey: string;
  vars: Record<string, string | number>;
  provinceId?: string;
}

export interface HistoryState {
  playerEvents: PlayerHistoryEvent[];
  divergences: HistoryDivergence[];
  lastSyncYear: number;
  lastOwners: Record<string, string>;
  lastTreaties: Record<string, Treaty>;
  lastRulerName: string;
  lastReignOrdinal: number;
  lastCampaignTarget: string | null;
}

export interface CrisisSeed {
  id: string;
  kind: CrisisKind;
  plantedYear: number;
  ripeYear: number;
  fromKey: string;
  payload: Record<string, string>;
  titleKey: string;
  bodyKey: string;
  sequel: boolean;
}

export interface CrisisRecord {
  id: string;
  year: number;
  kind: CrisisKind;
  key: string;
  choiceId: string;
}

export interface CrisisState {
  heat: Record<CrisisKind, number>;
  seeds: CrisisSeed[];
  lastFired: Partial<Record<CrisisKind, number>>;
  log: CrisisRecord[];
}

/** Visual-only. Never read by economy, army, siege or diplomacy engines. */
export interface WardrobeState {
  robeId: string;
  palaceId: string;
  bannerId: string;
}

export type TaxBand = "dusuk" | "normal" | "yuksek" | "harp";
export type DifficultyId = "kolay" | "nizam" | "zor" | "cihan";
export type ReformId = "askeri" | "mali" | "idari" | "diplomasi" | "derya";
export type InvestKind = "pazar" | "yol" | "liman" | "depo" | "kislak" | "tarim" | "sur";
export type MapLayer = "siyasi" | "ekonomi" | "sadakat" | "nufus" | "ordu" | "diplomasi" | "uretim" | "isyan";
export type PeaceDemand = "status" | "gold" | "province" | "tribute";
export type GameSpeed = "dur" | "normal" | "hizli";

export interface SpyIntel {
  year: number;
  men: number;
  treasury: number;
  confidence: number;
}

export interface TributePact {
  amount: number;
  until: number;
}

export interface GovernanceState {
  taxBand: TaxBand;
  difficulty: DifficultyId;
  reforms: ReformId[];
  population: Record<string, number>;
  works: Record<string, Partial<Record<InvestKind, number>>>;
  tutorialStep: number;
  achievements: string[];
  warsWon: number;
  warsLost: number;
  conquests: number;
  peaces: number;
  speed: GameSpeed;
  ironman: boolean;
  spy: Record<string, SpyIntel>;
  lastSpyYear: number;
  warScore: Record<string, number>;
  tributes: Record<string, TributePact>;
  outcome: "none" | "glory" | "strain";
  brokenPacts: number;
}

export interface GameState {
  version: number;
  seed: number;
  worldId: string;
  year: number;
  tick: number;
  taxRate: number;
  treasury: number;
  prestige: number;
  piety: number;
  stability: number;
  realm: Realm;
  ruler: Ruler;
  dynastyId: string;
  members: DynastyMember[];
  court: CourtPost[];
  npcs: Npc[];
  provinces: Province[];
  foreign: Realm[];
  relations: Relation[];
  army: Army;
  campaign: CampaignOp | null;
  siege: SiegeState | null;
  buildings: Buildings;
  pendingEvents: PendingEvent[];
  chronicle: ChronicleEntry[];
  ledger: LedgerEntry[];
  succession: SuccessionState | null;
  reigns: ReignRecord[];
  lastDivanYear: number;
  focus: Focus;
  palace: PalaceState;
  decisions: DecisionRecord[];
  courtTies: CourtTie[];
  divan: DivanState;
  harem: HaremState;
  economy: EconomyState;
  military: MilitaryState;
  diplomacy: DiplomacyState;
  world: WorldClockState;
  history: HistoryState;
  crisis: CrisisState;
  wardrobe: WardrobeState;
  governance: GovernanceState;
}

export interface CreateRulerInput {
  givenName: string;
  dynastyName: string;
  traits: TraitId[];
  focus: Focus;
  portrait: PortraitKey;
  locale: Locale;
  seatId?: string;
}

export type GameAction =
  | { type: "ADVANCE_YEAR" }
  | { type: "RESOLVE_EVENT"; eventId: string; choiceId: string }
  | { type: "APPOINT"; office: Office; npcId: string; postId?: string }
  | { type: "DISMISS"; postId: string }
  | { type: "SET_TAX"; rate: number }
  | { type: "RAISE_TROOPS"; kind: TroopKind; count: number }
  | { type: "DISBAND"; kind: TroopKind; count: number }
  | { type: "LAUNCH_CAMPAIGN"; provinceId: string }
  | { type: "RECALL_ARMY" }
  | { type: "GIFT"; realmId: string; amount: number }
  | { type: "TREATY"; realmId: string; treaty: Treaty }
  | { type: "SET_TRADE_PACT"; realmId: string; on: boolean }
  | { type: "SET_COALITION"; realmId: string; against: string | null }
  | { type: "DIP_OFFER"; realmId: string; kind: DipKind; terms: DipTerms }
  | { type: "DIP_RESPOND"; offerId: string; accept: boolean }
  | { type: "DIP_WITHDRAW"; offerId: string }
  | { type: "EDUCATE"; memberId: string; track: Education }
  | { type: "SANJAK"; memberId: string; provinceId: string }
  | { type: "BUILD"; building: Building }
  | { type: "GARRISON"; provinceId: string }
  | { type: "INVEST_PROVINCE"; provinceId: string }
  | { type: "SOOTHE_PROVINCE"; provinceId: string }
  | { type: "SET_TAX_BAND"; band: TaxBand }
  | { type: "INVEST_KIND"; provinceId: string; kind: InvestKind }
  | { type: "SUPPRESS_REVOLT"; provinceId: string }
  | { type: "REFORM"; reform: ReformId }
  | { type: "SPY_REALM"; realmId: string }
  | { type: "PEACE_TERMS"; realmId: string; demand: PeaceDemand; provinceId?: string }
  | { type: "SET_DIFFICULTY"; difficulty: DifficultyId }
  | { type: "SET_SPEED"; speed: GameSpeed }
  | { type: "SET_IRONMAN"; on: boolean }
  | { type: "TUTORIAL_STEP"; step: number }
  | { type: "HOLD_DIVAN" }
  | { type: "RESOLVE_DIVAN"; itemId: string; choiceId: string }
  | { type: "CLOSE_DIVAN" }
  | { type: "CONFIRM_SUCCESSION" }
  | { type: "BACK_PRETENDER"; memberId: string }
  | { type: "VISIT_ROOM"; room: PalaceRoomId }
  | { type: "AUDIENCE"; characterId: string; topic: AudienceTopic }
  | { type: "MARK_CINEMATIC"; id: string }
  | { type: "HAREM_ACT"; partnerId: string; act: BondAction }
  | { type: "ADVANCE_SCENE" }
  | { type: "SKIP_SCENE" }
  | { type: "FAVOR_CONSORT"; memberId: string }
  | { type: "INTRODUCE_CONSORT" }
  | { type: "DRILL_PRINCE"; memberId: string }
  | { type: "CULTIVATE"; memberId: string; npcId: string }
  | { type: "SET_TARIFF"; rate: number }
  | { type: "BORROW"; holder: DebtHolder; amount: number }
  | { type: "REPAY"; loanId: string; amount: number }
  | { type: "GRAIN_RELIEF"; amount: number }
  | { type: "SET_COMMANDER"; npcId?: string; memberId?: string }
  | { type: "SET_DOCTRINE"; doctrine: DoctrineId }
  | { type: "SET_TACTIC"; tactic: TacticId }
  | { type: "DRILL_HOST" }
  | { type: "PAY_ULUFE" }
  | { type: "STORM_FORT" }
  | { type: "SIEGE_ACTION"; action: SiegeActionId }
  | { type: "ADVANCE_SIEGE_CINEMA" }
  | { type: "SKIP_SIEGE_CINEMA" }
  | { type: "OFFER_PEACE"; realmId: string }
  | { type: "START_DUEL"; peerId: string; peerName: string; provinceId: string; seed: number; host: boolean; duelId: string }
  | { type: "RESOLVE_DUEL"; tactic: TacticId; foeTactic: TacticId }
  | { type: "SET_EDICTS"; edicts: Partial<StandingEdicts> }
  | { type: "COMMISSION_WORK"; building: Building }
  | { type: "MARK_NOTICE"; id: string }
  | { type: "MARK_NOTICES_READ" }
  | { type: "EQUIP_COSMETIC"; slot: "robe" | "palace" | "banner"; itemId: string };

export interface ActionResult {
  state: GameState;
  notices: ChronicleEntry[];
}

export const TRAIT_STAT: Record<TraitId, keyof RulerStats> = {
  adalet: "adalet",
  cesaret: "cesaret",
  ilim: "ilim",
  siyaset: "siyaset",
  comertlik: "adalet",
  zahid: "ilim",
};

export const TROOP_COST: Record<TroopKind, number> = {
  janissary: 8,
  sipahi: 5,
  azab: 2,
  akinji: 4,
  topcu: 40,
  navy: 25,
  levend: 3,
};

export const TROOP_UPKEEP: Record<TroopKind, number> = {
  janissary: 0.45,
  sipahi: 0.32,
  azab: 0.1,
  akinji: 0.22,
  topcu: 6,
  navy: 5,
  levend: 0.18,
};

export const TROOP_KINDS: TroopKind[] = [
  "janissary",
  "sipahi",
  "azab",
  "akinji",
  "topcu",
  "navy",
  "levend",
];

export const DOCTRINES: DoctrineId[] = ["hold", "sally", "scorch", "negotiate", "ambush"];
export const TACTICS: TacticId[] = [
  "center",
  "flank",
  "artillery",
  "cavalry_charge",
  "hold_line",
  "feint",
  "withdraw",
];

export const SIEGE_ACTIONS: SiegeActionId[] = ["bombard", "sap", "starve", "storm", "wait"];
export const CINEMA_BEATS: CinemaBeat[] = ["march", "guns", "walls", "cavalry", "commander", "victory", "defeat"];
export const DIP_KINDS: DipKind[] = ["envoy", "peace", "alliance", "trade", "war", "coalition"];
export const DIVERGENCE_KINDS: DivergenceKind[] = ["early", "late", "missed", "contrary", "alt"];
export const PLAYER_HISTORY_KINDS: PlayerHistoryKind[] = [
  "coronation",
  "conquest",
  "loss",
  "campaign",
  "campaign_failed",
  "treaty",
  "succession",
];
export const CRISIS_KINDS: CrisisKind[] = [
  "revolt",
  "janissary",
  "palace",
  "rivalry",
  "spy",
  "agent",
  "economy",
  "claim",
  "diplomatic",
  "commander",
];

/** Real milliseconds per in-game year. Demo pace so the living world is visible. */
export const MS_PER_YEAR = 90_000;
export const MAX_CATCHUP_YEARS = 12;
export const SWEEP_BATCH = 8;

export const ATTACK_EDICTS: AttackEdict[] = ["defend_walls", "sally", "ask"];
export const OFFENSIVE_EDICTS: OffensiveEdict[] = ["never", "hold_campaign"];
export const PEACE_EDICTS: PeaceEdict[] = ["ask", "accept_if_losing", "refuse"];
export const FAMINE_EDICTS: FamineEdict[] = ["relief", "ask", "endure"];
export const ULUFE_EDICTS: UlufeEdict[] = ["pay", "ask", "refuse"];
export const DEBT_EDICTS: DebtEdict[] = ["no_borrow", "borrow_if_empty", "ask"];
export const TAX_EDICTS: TaxEdict[] = ["hold", "ease_if_unrest"];
export const TRADE_EDICTS: TradeEdict[] = ["accept_friends", "ask", "refuse"];
export const WAR_OFFER_EDICTS: WarOfferEdict[] = ["ask", "refuse"];
export const WORKS_EDICTS: WorksEdict[] = ["none", "caravan"];


export const BUILDING_COST: Record<Building, number> = {
  cami: 2400,
  medrese: 1800,
  kervansaray: 1500,
  tersane: 2800,
  hisar: 2200,
};

export const PORTRAITS: PortraitKey[] = [
  "sultan-a",
  "sultan-b",
  "sultan-c",
  "valide",
  "vizier",
  "sehzade",
  "kaptan",
  "ulema",
  "hatun",
  "hatun-b",
];

export const PALACE_ROOMS: PalaceRoomId[] = [
  "taht",
  "divan",
  "harem",
  "hazine",
  "hasoda",
  "bahce",
  "elci",
  "sehzade",
  "askeri",
];

export const DIVAN_TOPICS: DivanTopic[] = [
  "savas",
  "ekonomi",
  "isyan",
  "diplomasi",
  "sehir",
  "ticaret",
  "ordu",
  "hanedan",
];

export function portraitSrc(key: PortraitKey): string {
  return `/art/${key}.jpg`;
}

export function sceneSrc(view: ViewId, succession: boolean): string {
  if (succession) return "/art/succession.jpg";
  switch (view) {
    case "saray":
      return "/art/throne-room.jpg";
    case "divan":
      return "/art/divan.jpg";
    case "hazine":
      return "/art/treasury.jpg";
    case "ordu":
      return "/art/army-camp.jpg";
    case "harita":
      return "/art/world-map.jpg";
    case "hanedan":
      return "/art/courtyard.jpg";
    case "diplomasi":
      return "/art/rooms/elci.jpg";
    case "tarih":
      return "/art/throne-room.jpg";
    case "cihan":
      return "/art/landing-bosphorus.jpg";
    case "bazaar":
      return "/art/courtyard.jpg";
    default:
      return "/art/throne-room.jpg";
  }
}
