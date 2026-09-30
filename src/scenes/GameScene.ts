import Phaser from 'phaser';
import type { BodyState, Difficulty, GameMode, LocationId, PlayStatus, RoundResult } from '../types';
import { bus } from '../core/bus';
import { api } from '../services/api';
import { theme as T } from '../theme';
import { ensureTextures } from '../core/settings';
import { Body } from '../core/matter';
import {
  W, KON, SAKA_START, FIELD, AIM_ZONE_TOP, MAX_PULL, MIN_PULL, MAX_SPEED, SETTLE_V, SETTLE_FRAMES, ASYK, SAKA_R, mulberry32,
} from '../core/const';
import { txt, button } from '../core/widgets';
import { LEVELS, type LevelDef } from '../levels/levels';
import { LOCATIONS, drawLocation, type LocationDef } from '../game/locations';
import { Agai } from '../game/Agai';
import { Kids } from '../game/Kids';
import { showLockOverlay } from '../ui';

export interface GameInit {
  mode: GameMode; difficulty: Difficulty; levelIndex: number; location: LocationId;
  seed?: number; myTurn?: boolean; customLevel?: LevelDef; tutorial?: boolean;
}
type Side = 'me' | 'opponent';
interface AsykObj { id: string; body: MatterJS.BodyType; sprite: Phaser.GameObjects.Image; isOut: boolean; removed: boolean }
const DIFF_RU: Record<Difficulty, string> = { easy: 'Лёгкая', medium: 'Средняя', hard: 'Сложная' };
const DIFFS: Difficulty[] = ['easy', 'medium', 'hard'];

export class GameScene extends Phaser.Scene {
  mode: GameMode = 'solo';
  difficulty: Difficulty = 'easy';
  levelIndex = 0;
  location: LocationId = 'summer_yard';
  seed = 1;
  myTurn = true;
  scores = { me: 0, opponent: 0 };

  protected isTutorial = false;
  protected customLevel?: LevelDef;
  protected level!: LevelDef;
  protected loc!: LocationDef;
  protected asyks: AsykObj[] = [];
  protected saka!: { body: MatterJS.BodyType; sprite: Phaser.GameObjects.Image };
  protected phase: 'aim' | 'moving' | 'over' = 'aim';
  protected ended = false;
  protected throwsLeft = 0;
  protected throwsUsed = 0;
  protected turn: Side = 'me';

  private aim: null | { id: number; ax: number; ay: number; dx: number; dy: number; pull: number } = null;
  private aimG!: Phaser.GameObjects.Graphics;
  private outThisThrow = 0;
  private brave = false;
  private agaiHit = false;
  private throwSide: Side = 'me';
  private quiet = 0;
  private moveFrames = 0;
  private moveStart = 0;
  private startedAt = 0;
  private lockedUI = false;
  private playAcc = 0;
  private agai?: Agai;
  private kids?: Kids;
  private spaceKey?: Phaser.Input.Keyboard.Key;
  private holdTouch = false;
  private holdPtrId = -1;
  private holdBtn?: Phaser.GameObjects.Zone;
  private holdG?: Phaser.GameObjects.Graphics;
  private holdLbl?: Phaser.GameObjects.Text;
  private holdHint?: Phaser.GameObjects.Text;
  protected hL?: Phaser.GameObjects.Text;
  private hC!: Phaser.GameObjects.Text;
  private hR!: Phaser.GameObjects.Text;
  private hS!: Phaser.GameObjects.Text;
  private hudKey = '';

  constructor(key: string = 'Game') { super(key); }

  // ---------- хуки для обучения ----------
  protected onPull(_power: number): void {}
  protected onLaunched(): void {}
  protected onAimCancel(): void {}
  protected onAsykOut(): void {}

  init(data: GameInit): void {
    this.mode = data.mode ?? 'solo';
    this.difficulty = data.difficulty ?? 'easy';
    this.levelIndex = data.levelIndex ?? 0;
    this.location = data.location ?? 'summer_yard';
    this.seed = data.seed ?? (DIFFS.indexOf(this.difficulty) * 10 + this.levelIndex + 1);
    this.myTurn = data.myTurn ?? true;
    this.customLevel = data.customLevel;
    this.isTutorial = !!data.tutorial;
  }

  create(): void {
    // полный сброс состояния (сцена переиспользуется при restart)
    this.ended = false; this.phase = 'aim'; this.aim = null; this.lockedUI = false; this.playAcc = 0;
    this.scores = { me: 0, opponent: 0 }; this.turn = this.mode === 'online' ? (this.myTurn ? 'me' : 'opponent') : 'me';
    this.throwsUsed = 0; this.asyks = []; this.holdTouch = false; this.holdPtrId = -1; this.hudKey = '';
    this.agai = undefined; this.kids = undefined; this.holdBtn = undefined; this.hL = undefined;
    this.outThisThrow = 0; this.brave = false; this.agaiHit = false; this.quiet = 0; this.moveFrames = 0;
    this.startedAt = Date.now();

    ensureTextures(this);
    this.loc = LOCATIONS[this.location];
    this.level = this.customLevel ?? LEVELS[this.difficulty][this.levelIndex];
    this.throwsLeft = this.level.throws;

    this.matter.world.resume();
    this.matter.world.setGravity(0, 0);
    this.matter.world.setBounds(0, FIELD.top, W, FIELD.bottom - FIELD.top, 64, true, true, true, true);

    drawLocation(this, this.loc);
    this.spawn();
    this.aimG = this.add.graphics().setDepth(20);

    if (!this.isTutorial) {
      this.kids = new Kids(this, this.loc.carColor);
      this.buildHud();
      this.time.addEvent({ delay: 1000, loop: true, callback: this.tickPlay, callbackScope: this });
      void this.checkLockOnEnter();
      if (this.difficulty === 'hard' && this.mode !== 'online') {
        this.agai = new Agai(this, this.seed);
        this.buildHold();
      }
    }

    // ввод
    this.input.addPointer(2);
    this.input.mouse?.disableContextMenu();
    this.spaceKey = this.input.keyboard?.addKey('SPACE');
    this.input.keyboard?.addCapture('SPACE');
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);

    // столкновение сақа с Агаем
    this.matter.world.on('collisionstart', (ev: any) => {
      if (this.phase !== 'moving' || this.agaiHit) return;
      for (const pr of ev.pairs) {
        const a = pr.bodyA.label, b = pr.bodyB.label;
        if ((a === 'saka' && b === 'agai') || (a === 'agai' && b === 'saka')) {
          this.agaiHit = true;
          bus.emit('agai:hit');
          this.cameras.main.shake(200, 0.008);
          navigator.vibrate?.(60);
          this.banner('Агай! −5');
          break;
        }
      }
    });

    bus.emit('round:start', this.mode, this.difficulty, this.levelIndex);
  }

  // ---------- создание тел ----------
  private spawn(): void {
    const rng = mulberry32(this.seed + 1);
    const fa = this.loc.frictionAir;
    this.level.asyks.forEach((p, i) => {
      const x = KON.x + p.x, y = KON.y + p.y, ang = (rng() - 0.5) * 0.6;
      const body = this.matter.add.rectangle(x, y, ASYK.w, ASYK.h, {
        chamfer: { radius: 6 }, restitution: 0.5, friction: 0.3, frictionAir: fa * 1.6, density: 0.002, angle: ang, label: 'asyk',
      }) as MatterJS.BodyType;
      const sprite = this.add.image(x, y, 'asyk').setDepth(10).setDisplaySize(ASYK.w, ASYK.h).setRotation(ang);
      this.asyks.push({ id: 'a' + i, body, sprite, isOut: false, removed: false });
    });
    const sb = this.matter.add.circle(SAKA_START.x, SAKA_START.y, SAKA_R, {
      restitution: 0.4, friction: 0.3, frictionAir: fa, density: 0.004, label: 'saka',
    }) as MatterJS.BodyType;
    this.saka = { body: sb, sprite: this.add.image(SAKA_START.x, SAKA_START.y, 'saka').setDepth(11).setDisplaySize(SAKA_R * 2, SAKA_R * 2) };
  }

  // ---------- HUD ----------
  private buildHud(): void {
    this.add.rectangle(360, 52, 720, 104, T.ink, 0.72).setDepth(30);
    this.hL = txt(this, 20, 34, '', 32, T.beige, { bold: true }).setOrigin(0, 0.5).setDepth(31);
    this.hC = txt(this, 360, 34, '', 30, T.peach, { bold: true }).setDepth(31);
    this.hR = txt(this, 600, 34, '', 32, T.beige, { bold: true }).setOrigin(1, 0.5).setDepth(31);
    this.hS = txt(this, 360, 82, '', 26, T.sage).setDepth(31);
    button(this, 676, 52, 64, 64, '✕', () => this.scene.start('Menu'), { size: 30, fill: T.stone }).setDepth(32);
  }

  private updateHud(): void {
    if (!this.hL) return;
    const left = this.asyks.filter((a) => !a.isOut).length;
    let l = '', c = '', r = '', s = '';
    if (this.mode === 'solo') { l = `Очки: ${this.scores.me}`; c = `Бросков: ${this.throwsLeft}`; s = `${DIFF_RU[this.difficulty]} · ${this.level.name} · асыков: ${left}`; }
    else if (this.mode === 'local2') { l = `Игрок 1: ${this.scores.me}`; r = `Игрок 2: ${this.scores.opponent}`; s = `Ход: Игрок ${this.turn === 'me' ? 1 : 2} · асыков: ${left}`; }
    else { l = `Ты: ${this.scores.me}`; r = `Соперник: ${this.scores.opponent}`; s = `${this.myTurn ? 'Твой ход' : 'Ход соперника'} · асыков: ${left}`; }
    const key = l + '|' + c + '|' + r + '|' + s;
    if (key === this.hudKey) return;
    this.hudKey = key;
    this.hL.setText(l); this.hC.setText(c); this.hR.setText(r); this.hS.setText(s);
  }

  private buildHold(): void {
    this.holdG = this.add.graphics().setDepth(25);
    this.holdBtn = this.add.zone(630, 1130, 150, 150).setInteractive().setDepth(26);
    this.holdBtn.on('pointerdown', (p: Phaser.Input.Pointer) => { this.holdTouch = true; this.holdPtrId = p.id; });
    this.holdLbl = txt(this, 630, 1130, 'ДЕРЖАТЬ\nАГАЯ', 24, T.beige, { bold: true }).setDepth(27);
    this.holdHint = txt(this, 190, 1178, 'Пробел / ПКМ — держать Агая', 22, T.beige).setDepth(27).setAlpha(0.85);
  }

  private holdWanted(): boolean {
    return !!(this.spaceKey?.isDown || this.input.mousePointer.rightButtonDown() || this.holdTouch);
  }

  private drawHold(): void {
    const a = this.agai; const g = this.holdG;
    if (!a || !g) return;
    g.clear();
    g.fillStyle(T.crimson, a.held ? 0.95 : 0.6).fillCircle(630, 1130, 66);
    g.lineStyle(a.held ? 7 : 4, T.peach, 1).strokeCircle(630, 1130, 66);
    g.fillStyle(T.ink, 0.7).fillRoundedRect(40, 1200, 300, 20, 8);
    const col = a.escaping ? T.crimson : a.stamina > 0.5 ? T.lime : a.stamina > 0.2 ? T.orange : T.crimson;
    g.fillStyle(col, 1).fillRoundedRect(40, 1200, 300 * a.stamina, 20, 8);
    g.lineStyle(2, T.beige, 1).strokeRoundedRect(40, 1200, 300, 20, 8);
    this.holdHint?.setText(a.escaping ? 'Агай вырвался!' : 'Пробел / ПКМ — держать Агая');
  }

  // ---------- ввод ----------
  protected canAim(): boolean {
    return !this.ended && !this.lockedUI && this.phase === 'aim' && (this.mode !== 'online' || this.myTurn);
  }

  private onDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (this.holdBtn && over && over.includes(this.holdBtn)) return;
    if (p.button === 2) return;
    if (!this.canAim() || this.aim || p.y < AIM_ZONE_TOP) return;
    this.aim = { id: p.id, ax: p.x, ay: p.y, dx: 0, dy: 0, pull: 0 };
  }

  private updateAim(a: NonNullable<GameScene['aim']>, p: Phaser.Input.Pointer): void {
    let dx = p.x - a.ax, dy = p.y - a.ay;
    const len = Math.hypot(dx, dy);
    if (len > MAX_PULL) { dx *= MAX_PULL / len; dy *= MAX_PULL / len; }
    a.dx = dx; a.dy = dy; a.pull = Math.min(len, MAX_PULL) / MAX_PULL;
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const a = this.aim;
    if (!a || a.id !== p.id) return;
    this.updateAim(a, p);
    if (a.pull * MAX_PULL >= MIN_PULL) this.onPull(a.pull);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id === this.holdPtrId) { this.holdTouch = false; this.holdPtrId = -1; }
    if (p.button === 2 && !p.wasTouch) return; // отпускание ПКМ (удержание Агая) не бросает
    const a = this.aim;
    if (!a || a.id !== p.id) return;
    this.aim = null; this.aimG.clear();
    this.updateAim(a, p);
    const ang = Math.atan2(-a.dy, -a.dx) + this.jitter(this.time.now);
    if (a.pull * MAX_PULL >= MIN_PULL && Math.sin(ang) < -0.1 && this.canAim()) this.launch(ang, a.pull);
    else this.onAimCancel();
  }

  private cancelAim(): void { this.aim = null; this.aimG?.clear(); }

  private jitter(time: number): number {
    return this.agai?.screaming ? Math.sin(time * 0.045) * 0.10 + Math.sin(time * 0.11) * 0.05 : 0;
  }

  private drawAim(time: number): void {
    const g = this.aimG; g.clear();
    const a = this.aim;
    if (!a || a.pull <= 0.02) return;
    const ang = Math.atan2(-a.dy, -a.dx) + this.jitter(time);
    const px = SAKA_START.x + a.dx, py = SAKA_START.y + a.dy;
    g.lineStyle(6, T.crimson, 0.95);
    g.lineBetween(SAKA_START.x - 46, SAKA_START.y - 8, px, py).lineBetween(SAKA_START.x + 46, SAKA_START.y - 8, px, py);
    g.fillStyle(T.beige, 0.35).fillCircle(px, py, SAKA_R);

    // пунктир траектории (простая кинематика с затуханием)
    const v0 = a.pull * MAX_SPEED, fa = this.loc.frictionAir, k = 1 - fa;
    const total = Math.log(0.6 / v0) / Math.log(k);
    if (total > 0) {
      const steps = Math.floor(total * this.level.hintFrac);
      const dx = Math.cos(ang), dy = Math.sin(ang);
      for (let s = 3; s <= steps; s += 3) {
        const d = (v0 * (1 - Math.pow(k, s))) / fa;
        const x = SAKA_START.x + dx * d, y = SAKA_START.y + dy * d;
        if (x < 0 || x > W || y < FIELD.top || y > FIELD.bottom) break;
        g.fillStyle(T.beige, Math.max(0.25, 1 - (s / Math.max(steps, 1)) * 0.7)).fillCircle(x, y, 5);
      }
    }

    // шкала силы
    const col = a.pull < 0.5 ? T.lime : a.pull < 0.8 ? T.orange : T.crimson;
    g.fillStyle(T.ink, 0.7).fillRoundedRect(180, 1240, 360, 18, 8);
    g.fillStyle(col, 1).fillRoundedRect(180, 1240, 360 * a.pull, 18, 8);
    g.lineStyle(2, T.beige, 1).strokeRoundedRect(180, 1240, 360, 18, 8);
  }

  // ---------- бросок ----------
  launch(angleRad: number, power01: number): void {
    if (this.phase !== 'aim' || this.ended) return;
    const power = Phaser.Math.Clamp(power01, 0, 1);
    this.phase = 'moving';
    this.moveStart = this.time.now; this.quiet = 0; this.moveFrames = 0;
    this.outThisThrow = 0; this.brave = false; this.agaiHit = false;
    this.throwSide = this.mode === 'online' ? (this.myTurn ? 'me' : 'opponent') : this.mode === 'local2' ? this.turn : 'me';
    this.throwsUsed++;
    if (this.mode === 'solo') this.throwsLeft--;
    const v = power * MAX_SPEED;
    Body.setVelocity(this.saka.body, { x: Math.cos(angleRad) * v, y: Math.sin(angleRad) * v });
    Body.setAngularVelocity(this.saka.body, 0);
    bus.emit('throw:start', angleRad, power);
    this.onLaunched();
  }

  // ---------- основной цикл ----------
  update(time: number, delta: number): void {
    this.syncSprites();
    if (this.ended) return;
    if (this.lockedUI) return;
    if (this.agai) { this.agai.update(time, delta, this.holdWanted()); this.drawHold(); }
    this.drawAim(time);
    this.updateHud();
    this.checkOut();
    if (this.phase === 'moving') this.stepMoving(time);
  }

  private syncSprites(): void {
    for (const a of this.asyks) {
      if (a.removed) continue;
      a.sprite.setPosition(a.body.position.x, a.body.position.y).setRotation(a.body.angle);
    }
    this.saka.sprite.setPosition(this.saka.body.position.x, this.saka.body.position.y).setRotation(this.saka.body.angle);
  }

  private checkOut(): void {
    for (const a of this.asyks) {
      if (a.removed) continue;
      const d = Math.hypot(a.body.position.x - KON.x, a.body.position.y - KON.y);
      if (!a.isOut && d > KON.r) this.markOut(a);
      else if (a.isOut && d > KON.r + 70) this.removeAsyk(a);
    }
  }

  private markOut(a: AsykObj): void {
    if (a.isOut) return; // очки за один асык — только один раз
    a.isOut = true;
    const counted = this.phase === 'moving';
    if (counted) {
      this.outThisThrow++;
      if (this.agai && this.agai.nearKon()) this.brave = true;
      this.floatText(a.body.position.x, a.body.position.y, '+10', T.peach);
    }
    a.sprite.setAlpha(0.6);
    this.dust(a.body.position.x, a.body.position.y);
    bus.emit('asyk:out', a.id);
    this.kids?.cheer();
    this.cameras.main.shake(100, 0.003);
    navigator.vibrate?.(30);
    this.onAsykOut();
    if (!counted) this.checkEnd();
  }

  private removeAsyk(a: AsykObj): void {
    if (a.removed) return;
    a.removed = true;
    try { this.matter.world.remove(a.body); } catch { /* уже удалено */ }
    this.tweens.add({ targets: a.sprite, alpha: 0, duration: 250, onComplete: () => a.sprite.setVisible(false) });
  }

  private stepMoving(time: number): void {
    this.moveFrames++;
    let still = this.saka.body.speed < SETTLE_V;
    for (const a of this.asyks) if (!a.isOut && a.body.speed >= SETTLE_V) still = false;
    this.quiet = still ? this.quiet + 1 : 0;
    if ((this.quiet >= SETTLE_FRAMES && this.moveFrames > 25) || time - this.moveStart > 15000) this.settle();
  }

  private settle(): void {
    const sp = this.saka.body.position;
    const sakaInside = Math.hypot(sp.x - KON.x, sp.y - KON.y) < KON.r;
    const n = this.outThisThrow, agaiHit = this.agaiHit;
    let mult = n >= 3 ? 2 : n === 2 ? 1.5 : 1;
    const brave = this.brave && n > 0;
    if (brave) mult *= 2;
    let delta = Math.round(n * 10 * mult);
    if (sakaInside) delta -= 1;
    if (agaiHit) delta -= 5;

    const side = this.throwSide;
    const before = this.scores[side];
    this.scores[side] = Math.max(0, before + delta);
    const scoreDelta = this.scores[side] - before;

    const msgs: string[] = [];
    if (n > 0) msgs.push(`+${Math.round(n * 10 * mult)}`);
    if (n >= 2) msgs.push(`Комбо ×${n >= 3 ? 2 : 1.5}`);
    if (brave) msgs.push('Смелый бросок ×2');
    if (sakaInside) msgs.push('Сақа в коне −1');
    if (n === 0 && !agaiHit) msgs.push('Мимо');
    if (msgs.length && !this.isTutorial) this.banner(msgs.join(' · '));

    // убрать выбитые, вернуть сақа на линию
    this.asyks.forEach((a) => { if (a.isOut) this.removeAsyk(a); });
    Body.setPosition(this.saka.body, { x: SAKA_START.x, y: SAKA_START.y });
    Body.setVelocity(this.saka.body, { x: 0, y: 0 });
    Body.setAngularVelocity(this.saka.body, 0);
    Body.setAngle(this.saka.body, 0);

    const turnPassed = n === 0 || agaiHit;
    if (turnPassed) {
      if (this.mode === 'local2') this.turn = this.turn === 'me' ? 'opponent' : 'me';
      else if (this.mode === 'online') { this.myTurn = !this.myTurn; this.turn = this.myTurn ? 'me' : 'opponent'; }
    }
    if (n > 0 && !agaiHit) this.kids?.cheer(); else this.kids?.sad();

    this.phase = 'aim';
    bus.emit('throw:settled', this.getSnapshot(), scoreDelta, turnPassed);
    this.checkEnd();
  }

  // ---------- конец раунда ----------
  protected checkEnd(): void {
    if (this.isTutorial || this.ended) return;
    const left = this.asyks.filter((a) => !a.isOut).length;
    if (left === 0) { this.endRound(true); return; }
    if (this.mode === 'solo' && this.throwsLeft <= 0 && this.phase !== 'moving') this.endRound(false);
  }

  private initData(): GameInit {
    return { mode: this.mode, difficulty: this.difficulty, levelIndex: this.levelIndex, location: this.location, seed: this.seed };
  }

  private nextData(): GameInit | null {
    if (this.mode !== 'solo') return null;
    if (this.levelIndex < 2) return { ...this.initData(), levelIndex: this.levelIndex + 1, seed: undefined };
    const i = DIFFS.indexOf(this.difficulty);
    if (i < 2) return { ...this.initData(), difficulty: DIFFS[i + 1], levelIndex: 0, seed: undefined };
    return null;
  }

  private endRound(won: boolean): void {
    if (this.ended) return;
    this.ended = true; this.phase = 'over'; this.cancelAim();
    const total = this.level.asyks.length;
    const out = this.asyks.filter((a) => a.isOut).length;
    let stars: 0 | 1 | 2 | 3 = 0;
    if (this.mode === 'solo') {
      if (won) { const r = this.throwsLeft / this.level.throws; stars = r >= 0.5 ? 3 : r >= 0.25 ? 2 : 1; }
    } else won = this.scores.me > this.scores.opponent;
    const result: RoundResult = {
      mode: this.mode, difficulty: this.difficulty, levelIndex: this.levelIndex, location: this.location,
      score: this.scores.me, stars, throwsUsed: this.throwsUsed, asykOut: out, asykTotal: total, won,
      durationSec: Math.round((Date.now() - this.startedAt) / 1000), finishedAt: new Date().toISOString(),
    };
    bus.emit('round:end', result);
    const data = {
      result, opp: this.scores.opponent,
      retry: this.mode === 'online' ? null : this.initData(),
      next: won ? this.nextData() : null,
    };
    this.time.delayedCall(900, () => this.scene.start('Result', data));
  }

  // ---------- публичный контракт для мультиплеера ----------
  getSnapshot(): BodyState[] {
    const r = (v: number) => Math.round(v * 100) / 100;
    const s: BodyState[] = this.asyks.map((a) => ({ id: a.id, x: r(a.body.position.x), y: r(a.body.position.y), angle: r(a.body.angle), isOut: a.isOut }));
    s.push({ id: 'saka', x: r(this.saka.body.position.x), y: r(this.saka.body.position.y), angle: r(this.saka.body.angle), isOut: false });
    return s;
  }

  applySnapshot(states: BodyState[], animate = false): void {
    for (const s of states) {
      if (s.id === 'saka') { this.moveBody(this.saka.body, s.x, s.y, s.angle, animate); continue; }
      const a = this.asyks.find((o) => o.id === s.id);
      if (!a) continue;
      if (s.isOut) { a.isOut = true; this.moveBody(a.body, s.x, s.y, s.angle, false); this.removeAsyk(a); }
      else this.moveBody(a.body, s.x, s.y, s.angle, animate);
    }
    this.phase = this.ended ? 'over' : 'aim'; this.quiet = 0;
    this.checkEnd();
  }

  private moveBody(body: MatterJS.BodyType, x: number, y: number, ang: number, animate: boolean): void {
    Body.setVelocity(body, { x: 0, y: 0 }); Body.setAngularVelocity(body, 0);
    if (!animate) { Body.setPosition(body, { x, y }); Body.setAngle(body, ang); return; }
    const fx = body.position.x, fy = body.position.y, fa = body.angle;
    this.tweens.addCounter({
      from: 0, to: 1, duration: 450,
      onUpdate: (tw) => {
        const v = tw.getValue();
        Body.setPosition(body, { x: fx + (x - fx) * v, y: fy + (y - fy) * v });
        Body.setAngle(body, fa + (ang - fa) * v);
        Body.setVelocity(body, { x: 0, y: 0 });
      },
    });
  }

  setMyTurn(v: boolean): void {
    this.myTurn = v;
    if (this.mode === 'online') this.turn = v ? 'me' : 'opponent';
    if (!v) this.cancelAim();
  }

  // ---------- лимит времени ----------
  private tickPlay(): void {
    if (document.hidden || this.ended || this.lockedUI) return;
    this.playAcc++;
    if (this.playAcc >= 15) { this.playAcc = 0; void this.reportTime(); }
  }

  private async reportTime(): Promise<void> {
    try { const st = await api.reportPlaySeconds(15); if (st.locked) this.lock(st); } catch (e) { console.error(e); }
  }

  private async checkLockOnEnter(): Promise<void> {
    try { const st = await api.getPlayStatus(); if (st.locked) this.lock(st); } catch (e) { console.error(e); }
  }

  private lock(st: PlayStatus): void {
    if (!this.sys.isActive() || this.lockedUI || this.ended) return;
    this.lockedUI = true; this.cancelAim();
    this.matter.world.pause();
    this.kids?.driveCar();
    showLockOverlay(st.secondsLeft, () => {
      if (!this.sys.isActive()) return;
      this.lockedUI = false; this.playAcc = 0; this.matter.world.resume();
    });
  }

  // ---------- эффекты ----------
  private floatText(x: number, y: number, s: string, color: number): void {
    const t = txt(this, x, y, s, 36, color, { bold: true, stroke: T.ink }).setDepth(40);
    this.tweens.add({ targets: t, y: y - 60, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  private banner(s: string): void {
    const t = txt(this, 360, 350, s, 34, T.peach, { bold: true, stroke: T.ink, w: 680 }).setDepth(40);
    this.tweens.add({ targets: t, y: 320, alpha: 0, duration: 1400, delay: 500, onComplete: () => t.destroy() });
  }

  private dust(x: number, y: number): void {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const c = this.add.circle(x, y, 6, T.beige, 0.7).setDepth(15);
      this.tweens.add({ targets: c, x: x + Math.cos(a) * 40, y: y + Math.sin(a) * 40, alpha: 0, scale: 2, duration: 400, onComplete: () => c.destroy() });
    }
  }
}
