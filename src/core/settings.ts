import type Phaser from 'phaser';
import type { Difficulty, LocationId, Profile } from '../types';
import { api } from '../services/api';
import { createTextures } from '../visuals/textures';

export const settings = {
  difficulty: 'easy' as Difficulty,
  location: 'summer_yard' as LocationId,
  profile: null as Profile | null,
  texKey: '',
  tutorialAsked: false,
};

export async function loadSettings(): Promise<Profile> {
  const p = await api.getProfile();
  settings.profile = p;
  settings.location = p.location;
  return p;
}

export async function refreshProfile(): Promise<Profile> {
  const p = await api.getProfile();
  settings.profile = p;
  return p;
}

export function ensureTextures(scene: Phaser.Scene): void {
  const p = settings.profile;
  const opts = { asykSkin: p?.asykSkin ?? 'classic', takia: p?.takia ?? 'classic', location: settings.location } as const;
  const key = `${opts.asykSkin}|${opts.takia}|${opts.location}`;
  if (key === settings.texKey && scene.textures.exists('asyk')) return;
  createTextures(scene, { ...opts });
  settings.texKey = key;
}
