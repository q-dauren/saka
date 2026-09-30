import type { Difficulty, LocationId, AsykSkinId, TakiaId, Profile, PlayStatus, RoundResult } from '../types';

export interface Api {
  init(): Promise<void>;
  getUser(): Promise<{ id: string; email: string } | null>;
  signUp(email: string, password: string, nickname: string): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signInGoogle(): Promise<void>;
  signOut(): Promise<void>;
  getProfile(): Promise<Profile>;
  updateProfile(patch: Partial<Omit<Profile, 'id' | 'isPro'>>): Promise<Profile>;
  saveResult(r: RoundResult): Promise<void>;
  getBest(): Promise<Record<string, number>>;
  getHistory(limit?: number): Promise<RoundResult[]>;
  getInventory(): Promise<string[]>;
  purchase(itemId: string): Promise<void>;
  setPro(active: boolean): Promise<void>;
  getPlayStatus(): Promise<PlayStatus>;
  reportPlaySeconds(seconds: number): Promise<PlayStatus>;
}

const K = 'saka:';
function rd<T>(k: string, d: T): T {
  try { const v = localStorage.getItem(K + k); return v ? (JSON.parse(v) as T) : d; } catch { return d; }
}
function wr(k: string, v: unknown): void {
  try { localStorage.setItem(K + k, JSON.stringify(v)); } catch { /* приватный режим */ }
}

const BUDGET = 600;  // 10 минут активной игры
const LOCK = 900;    // 15 минут блокировки
type PlayState = { used: number; lockedUntil: number | null };
type StoredProfile = { nickname: string; takia: TakiaId; asykSkin: AsykSkinId; location: LocationId; tutorialDone: boolean };

class LocalApi implements Api {
  async init(): Promise<void> {}
  async getUser() { return null; }
  private off(): never { throw new Error('Вход недоступен в локальном режиме'); }
  async signUp(): Promise<void> { this.off(); }
  async signIn(): Promise<void> { this.off(); }
  async signInGoogle(): Promise<void> { this.off(); }
  async signOut(): Promise<void> {}

  async getProfile(): Promise<Profile> {
    const p = rd<StoredProfile>('profile', { nickname: 'Гость', takia: 'classic', asykSkin: 'classic', location: 'summer_yard', tutorialDone: false });
    return { id: 'guest', ...p, isPro: rd('pro', false) };
  }
  async updateProfile(patch: Partial<Omit<Profile, 'id' | 'isPro'>>): Promise<Profile> {
    const cur = await this.getProfile();
    const { id, isPro, ...rest } = cur;
    wr('profile', { ...rest, ...patch });
    return this.getProfile();
  }

  async saveResult(r: RoundResult): Promise<void> {
    const hist = rd<RoundResult[]>('history', []);
    hist.unshift(r);
    wr('history', hist.slice(0, 200));
    if (r.mode === 'solo') {
      const best = rd<Record<string, number>>('best', {});
      const k = `${r.difficulty as Difficulty}:${r.levelIndex}`;
      if (r.score > (best[k] ?? 0)) { best[k] = r.score; wr('best', best); }
    }
  }
  async getBest() { return rd<Record<string, number>>('best', {}); }
  async getHistory(limit = 50) { return rd<RoundResult[]>('history', []).slice(0, limit); }
  async getInventory() { return rd<string[]>('inventory', []); }
  async purchase(itemId: string): Promise<void> {
    const inv = rd<string[]>('inventory', []);
    if (!inv.includes(itemId)) { inv.push(itemId); wr('inventory', inv); }
  }
  async setPro(active: boolean): Promise<void> { wr('pro', active); }

  async getPlayStatus(): Promise<PlayStatus> {
    if (rd('pro', false)) return { locked: false, secondsLeft: BUDGET, lockedUntil: null, isPro: true };
    let s = rd<PlayState>('play', { used: 0, lockedUntil: null });
    const now = Date.now();
    if (s.lockedUntil && now >= s.lockedUntil) { s = { used: 0, lockedUntil: null }; wr('play', s); }
    if (s.lockedUntil) {
      return { locked: true, secondsLeft: Math.ceil((s.lockedUntil - now) / 1000), lockedUntil: new Date(s.lockedUntil).toISOString(), isPro: false };
    }
    return { locked: false, secondsLeft: Math.max(0, BUDGET - s.used), lockedUntil: null, isPro: false };
  }
  async reportPlaySeconds(seconds: number): Promise<PlayStatus> {
    if (!rd('pro', false)) {
      const s = rd<PlayState>('play', { used: 0, lockedUntil: null });
      if (!s.lockedUntil) {
        s.used += seconds;
        if (s.used >= BUDGET) s.lockedUntil = Date.now() + LOCK * 1000;
        wr('play', s);
      }
    }
    return this.getPlayStatus();
  }
}

export const api: Api = new LocalApi();
