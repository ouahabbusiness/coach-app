// Ippo — coach IA. Types partagés entre le contexte, le prompt, le fournisseur et l'écran.
// Règle du projet : une valeur absente vaut null, jamais 0.

export type IppoRole = 'user' | 'assistant';

export interface IppoMessage {
  id: string;
  role: IppoRole;
  content: string;
  at: number;
  /** Provenance : utile pour ne jamais présenter une réponse de démonstration comme une vraie réponse IA. */
  origin?: 'llm' | 'demo' | 'local' | 'error';
}

export interface IppoProfile {
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  weightSource: 'pesée' | 'déclaré' | null;
  waistCm: number | null;
  sex: 'homme' | 'femme' | null;
  tone: 'ferme' | 'neutre' | 'doux' | null;
}

export interface IppoGoal {
  main: string | null;
  secondary: string[];
  description: string | null;
  why: string | null;
  targetDate: string | null;
  limits: string | null;
}

export interface IppoProgram {
  title: string;
  weeks: number | null;
  templates: { title: string; lines: number }[];
  rules: string[];
}

export interface IppoSession {
  day: string;
  title: string;
  outcome: string;
  durationMin: number | null;
  doneSets: number | null;
  workSets: number | null;
  painReports: number;
}

export interface IppoWeight {
  latestKg: number | null;
  latestDay: string | null;
  trend: string;
  deltaKg: number | null;
}

export interface IppoNutrition {
  todayKcal: number | null;
  todayProteinG: number | null;
  todayComplete: boolean | null;
  restrictions: string | null;
  mealsPerDay: number | null;
}

export interface IppoDay {
  day: string;
  sleepH: number | null;
  steps: number | null;
}

export interface IppoEquipment {
  items: string[];
  kettlebells: number[];
  loadPieces: number[];
  bought: string[];
}

export interface IppoContext {
  generatedAt: number;
  day: string;
  profile: IppoProfile;
  equipment: IppoEquipment;
  goal: IppoGoal | null;
  program: IppoProgram | null;
  sessions: IppoSession[];
  weight: IppoWeight;
  nutrition: IppoNutrition;
  days: IppoDay[];
  safety: { pains: string | null; restrictions: string | null };
  gaps: string[];
}

export interface IppoConfig {
  /** Base compatible OpenAI (ex. https://api.deepseek.com/v1). */
  baseUrl: string;
  model: string;
  /** Stockée uniquement sur cet appareil. Jamais envoyée ailleurs qu'au fournisseur choisi. */
  apiKey: string;
}

export const DEFAULT_IPPO_CONFIG: IppoConfig = {
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  apiKey: '',
};

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
