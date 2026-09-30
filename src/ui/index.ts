import { openAuthScreen } from './auth';
import { openProfileScreen } from './profile';
import { openHistoryScreen } from './history';
import { openShopScreen } from './shop';
import { showLockScreen } from './lock';

export { toast } from './common';

export function openAuth(): void { openAuthScreen(); }
export function openProfile(): void { void openProfileScreen(); }
export function openHistory(): void { void openHistoryScreen(); }
export function openShop(): void { void openShopScreen('skins'); }
export function showLockOverlay(secondsLeft: number, onUnlocked: () => void): void {
  showLockScreen(secondsLeft, onUnlocked);
}
