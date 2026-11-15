#!/usr/bin/env node
'use strict';
/*
 * Generates the Dungeon Gear tool textures (gear module 1.2: sword, axe and pickaxe of tiers I-VII, one tier per dungeon
 * zone) and the Dungeon Shard textures (mining: one shard per zone) of the vortex-skyblock pack. Everything is drawn
 * here, pixel by pixel, from shapes and per-tier palettes: no vanilla texture is read or copied.
 *
 * The gear module stamps the custom_model_data string "vortex:gear/<piece>_<tier>" (piece sword / axe / pickaxe, tier
 * 1..7) on its NETHERITE_* items; mining, the dungeon hub, the Recipe Book and the spawners stamp "vortex:shard/<zone>"
 * on AMETHYST_SHARD. assets/minecraft/items/<vanilla item>.json selects on it (merged with any cases already there) and
 * falls back to the vanilla model, so the plain vanilla items stay vanilla.
 *
 * Writes:
 *   assets/vortex/textures/item/gear/<piece>_<tier>.png   16x16
 *   assets/vortex/models/item/gear/<piece>_<tier>.json    parent minecraft:item/handheld
 *   assets/minecraft/items/netherite_<piece>.json         select on custom_model_data, vanilla fallback
 *   assets/vortex/textures/item/shard/<zone>.png          16x16 (models vortex:item/shard/<zone>, item/generated)
 *   assets/minecraft/items/amethyst_shard.json            the same select, its other cases kept
 * and, with a second argument, a contact sheet (8x, dark + light) and three in-hand style renders.
 *
 *     node tools/GearPackGen.js <pack root> [preview.png]
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

// ---- palettes: tier n = dungeon zone n (Gear.yml tier names / Mining.yml zone colours) --------------------------------
// main: outline, dark, mid, light, highlight (the zone's ore); fit: outline, dark, light (guard / collar / pommel, an
// accent from the zone's other ores); grip: dark, mid, light; gem: dark, light, shine; glow: base, bright.
const TIERS = [
   {name: 'Amethyst', zone: 'Amethyst Hollows',
      main: ['#2c1745', '#5f3590', '#8655c0', '#b083ec', '#e6d0ff'], fit: ['#2a2631', '#5f5969', '#a39cb2'],
      grip: ['#261d2e', '#45364f', '#6e5a7d'], gem: ['#8a5410', '#e3a53a', '#fff0b8'], glow: ['#c48cff', '#f2e2ff']},
   {name: 'Topaz', zone: 'Topaz Tunnels',
      main: ['#4e2a06', '#9a5c0e', '#d18c1f', '#f6bb43', '#fff0b0'], fit: ['#3e1f12', '#86462a', '#cc7a4c'],
      grip: ['#2e1d11', '#573822', '#87603a'], gem: ['#17643a', '#3fcf7a', '#c6ffdc'], glow: ['#ffd35c', '#fff6cc']},
   {name: 'Jade', zone: 'Jade Grotto',
      main: ['#0c3a20', '#1b7340', '#2c9f58', '#53cc7e', '#bff7d4'], fit: ['#4a3006', '#a8761a', '#f1cb52'],
      grip: ['#1a2421', '#33463f', '#557063'], gem: ['#7d0f1a', '#de2f3d', '#ffb0b6'], glow: ['#7dffb0', '#e0fff0']},
   {name: 'Sapphire', zone: 'Sapphire Deep',
      main: ['#0b1a49', '#1b3891', '#2c58c9', '#5889f0', '#c4daff'], fit: ['#2f3e49', '#7d98a8', '#dcf4ff'],
      grip: ['#15151c', '#2f2f3b', '#50505f'], gem: ['#5d8fa6', '#bfeeff', '#ffffff'], glow: ['#8fdcff', '#eafaff']},
   {name: 'Ruby', zone: 'Ruby Forge',
      main: ['#430812', '#86121f', '#bf2232', '#ec4a56', '#ffb8bd'], fit: ['#5a3a08', '#bb901c', '#ffe55e'],
      grip: ['#241212', '#452424', '#6e3a34'], gem: ['#b8780e', '#ffd84a', '#fffbd0'], glow: ['#ff9a3c', '#ffe0a0']},
   {name: 'Void', zone: 'Void Rift',
      main: ['#110519', '#33114d', '#56217f', '#8740bf', '#d7a6ff'], fit: ['#0d0a12', '#40345a', '#8a74b0'],
      grip: ['#140f1a', '#2b2138', '#4a3a60'], gem: ['#6a8f9c', '#cdf6ff', '#ffffff'], glow: ['#d062ff', '#f8d8ff']},
   {name: 'Starfall', zone: 'Starfall Core',
      main: ['#08292e', '#146a73', '#25a3ad', '#5bdde4', '#d6ffff'], fit: ['#5c3d06', '#c99a1e', '#fff08a'],
      grip: ['#122023', '#25403f', '#3f6766'], gem: ['#c9a227', '#fff3a8', '#ffffff'], glow: ['#7ffcff', '#fffbe6']}];

// ---- the 16x16 drawing model -------------------------------------------------------------------------------------------
// Tools lie on the diagonal from the bottom-left (grip) to the top-right (head), like the vanilla ones.
// t = x - y runs along the tool, p = x + y - 15 across it (p < 0 is the upper-left side, the lit side).
const T = (x, y) => x - y;
const P = (x, y) => x + y - 15;
const inside = (x, y) => x >= 0 && y >= 0 && x < 16 && y < 16;

/** A mask from a predicate over (x, y). */
function mask(fn) {
   const m = [];
   for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
         m[y * 16 + x] = !!fn(x, y, T(x, y), P(x, y));
      }
   }
   return m;
}

/** A mask from rows of '#'; mirror = also its reflection across the tool axis (x, y) -> (15 - y, 15 - x). */
function rows(lines, mirror) {
   return mask((x, y) => {
      const at = (a, b) => (lines[b] || '')[a] === '#';
      return at(x, y) || (mirror && at(15 - y, 15 - x));
   });
}

const has = (m, x, y) => inside(x, y) && m[y * 16 + x];

/**
 * Renders parts (bottom to top) to a 16x16 grid of role letters.
 * part: {m: mask, kind: 'metal' | 'fit' | 'grip' | 'flat', role (flat), outline: 'all' | 'empty' | 'none'}
 * roles: o 1 2 3 4 (metal outline..highlight), q f F (fitting), k h H (grip), j J x (gem), w W (glow), s (sparkle)
 */
function render(parts) {
   const g = Array(256).fill('.');
   const top = Array(256).fill(-1);
   parts.forEach((pt, i) => pt.m.forEach((v, k) => {
      if (v) {
         top[k] = i;
      }
   }));
   const solid = (x, y) => inside(x, y) && top[y * 16 + x] >= 0;
   parts.forEach((pt, i) => {
      const own = (x, y) => has(pt.m, x, y);
      const edge = (x, y) => {
         const nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
         if (pt.outline === 'none') {
            return false;
         }

         if (pt.outline === 'empty') {
            return nb.some(([a, b]) => !solid(a, b));
         }

         return nb.some(([a, b]) => !own(a, b));
      };
      const interior = (x, y) => own(x, y) && !edge(x, y);
      for (let y = 0; y < 16; y++) {
         for (let x = 0; x < 16; x++) {
            const k = y * 16 + x;
            if (top[k] !== i) {
               continue;
            }

            if (pt.kind === 'flat') {
               g[k] = pt.role;
               continue;
            }

            if (pt.kind === 'grip') {
               // two strands: lit upper-left (p = -1), shaded (p = 0); a darker wrap every third step
               const wrap = pt.wrap && ((T(x, y) % 3) + 3) % 3 === 0;
               g[k] = P(x, y) < 0 ? (wrap ? 'h' : 'H') : (wrap ? 'k' : 'h');
               continue;
            }

            const ramp = pt.kind === 'fit' ? ['q', 'f', 'f', 'F', 'F'] : ['o', '1', '2', '3', '4'];
            if (edge(x, y)) {
               g[k] = ramp[0];
               continue;
            }

            const lit = !interior(x - 1, y) || !interior(x, y - 1);
            const dark = !interior(x + 1, y) || !interior(x, y + 1);
            g[k] = lit ? ramp[3] : dark ? ramp[1] : ramp[2];
         }
      }
   });
   return g;
}

const setp = (g, x, y, r) => {
   if (inside(x, y)) {
      g[y * 16 + x] = r;
   }
};
const getp = (g, x, y) => inside(x, y) ? g[y * 16 + x] : '.';

/** a 2x2 cut gem: shine top-left, light, dark bottom-right */
function gem2(g, x, y) {
   setp(g, x, y, 'x');
   setp(g, x + 1, y, 'J');
   setp(g, x, y + 1, 'J');
   setp(g, x + 1, y + 1, 'j');
}

/** a 4-point star sparkle centred on (x, y): the centre white, the arms bright glow (only over drawn pixels) */
function sparkle(g, x, y, arms) {
   setp(g, x, y, 's');
   if (arms) {
      for (const [a, b] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
         if (getp(g, a, b) !== '.') {
            setp(g, a, b, 'W');
         }
      }
   }
}

// ---- the pieces --------------------------------------------------------------------------------------------------------

function sword(n) {
   const guardHalf = [4, 4, 5, 5, 6, 6, 7][n - 1];
   const tip = 13;
   const blade = mask((x, y, t, p) => {
      const w = n >= 6 && t <= 2 ? 3 : 2;
      return t >= -3 && t <= tip && Math.abs(p) <= Math.min(w, tip - t);
   });
   const guard = mask((x, y, t, p) => {
      const a = Math.abs(p);
      if (a > guardHalf) {
         return false;
      }

      if (t >= -5 && t <= -3) {
         return true;
      }

      // tier IV+: quillon tips curl towards the blade; tier VII: swept wings
      if (n >= 4 && a >= guardHalf - 1 && t >= -5 && t <= -1) {
         return true;
      }

      return n >= 7 && a >= guardHalf - 2 && t >= -2 && t <= (a === guardHalf ? 1 : -1);
   });
   const grip = mask((x, y, t, p) => t >= -11 && t <= -6 && (p === -1 || p === 0));
   const pommel = n <= 2
      ? mask((x, y) => (x === 1 && y >= 13 && y <= 15) || (y === 14 && x >= 0 && x <= 2))
      : mask((x, y) => x <= 2 && y >= 13);
   const parts = [
      {m: blade, kind: 'metal', outline: 'empty'},
      {m: grip, kind: 'grip', wrap: n >= 3},
      {m: pommel, kind: 'fit', outline: 'all'},
      {m: guard, kind: 'fit', outline: 'all'}];
   const g = render(parts);

   // blade details
   for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
         const t = T(x, y), p = P(x, y), r = getp(g, x, y);
         if (!has(blade, x, y) || has(guard, x, y) || r === 'o') {
            continue;
         }

         // a bright edge glint near the point and at mid-blade
         if (p === -1 && (t === tip - 3 || t === tip - 5 || (n >= 2 && t === 3))) {
            setp(g, x, y, '4');
         }

         // fuller (tier III+): a groove down the middle of the blade; glowing from tier V, a rune line at VI+
         if (n >= 3 && p === 0 && t >= -1 && t <= (n >= 6 ? 9 : 7)) {
            setp(g, x, y, n >= 5 ? (t % 4 === 1 && n >= 6 ? 'W' : 'w') : '1');
         }
      }
   }

   if (n >= 2) {
      gem2(g, 5, 9);
   }

   if (n >= 4) {
      setp(g, 1, 14, n >= 6 ? 'x' : 'J');
   }

   if (n >= 7) {
      sparkle(g, 13, 2, false);
      sparkle(g, 9, 5, false);
      setp(g, 14, 1, 'W');
   }

   return g;
}

const AXE_HEADS = [
   [ // tiers I-II: a bearded bit, the cutting edge on the left
      '.....##.........',
      '....#####.......',
      '...########.....',
      '...#########....',
      '..#########.....',
      '..########......',
      '..#####.........',
      '..####..........',
      '...###..........',
      '....#...........'],
   [ // tiers III-V: a broader bit, a hammer poll behind the handle
      '....###.........',
      '...######.......',
      '..#########.....',
      '..##########.##.',
      '.##########.###.',
      '.#########.###..',
      '.######.........',
      '.#####..........',
      '..####..........',
      '...##...........'],
   [ // tiers VI-VII: a great crescent bit, a spear point and a spiked poll
      '...####.........',
      '..#######.......',
      '.#########......',
      '.##########..##.',
      '###########.####',
      '##########.####.',
      '#######....##...',
      '######..........',
      '.#####..........',
      '..####..........',
      '...##...........']];

function axe(n) {
   const lvl = n <= 2 ? 0 : n <= 5 ? 1 : 2;
   const headRows = AXE_HEADS[lvl];
   const raw = rows(headRows, false);
   // the right of the handle (p > 0) is the poll / spike, the rest the bit
   const head = mask((x, y, t, p) => has(raw, x, y) && p <= -2);
   const poll = mask((x, y, t, p) => has(raw, x, y) && p >= 1);
   const grip = mask((x, y, t, p) => t >= -13 && t <= (lvl === 2 ? 9 : 11) && (p === -1 || p === 0));
   const spear = lvl === 2 ? mask((x, y, t, p) => (t >= 10 && t <= 13 && Math.abs(p) <= Math.min(1, 13 - t))) : mask(() => false);
   const collar = n >= 2 ? mask((x, y, t, p) => (p === -1 || p === 0) && t >= (lvl === 2 ? 8 : 9) && t <= (lvl === 2 ? 9 : 10)) : mask(() => false);
   const cap = n >= 4 ? mask((x, y) => (x === 1 && y === 14) || (x === 1 && y === 13) || (x === 0 && y === 14)) : mask(() => false);
   const parts = [
      {m: grip, kind: 'grip', wrap: n >= 3},
      {m: poll, kind: 'metal', outline: 'all'},
      {m: spear, kind: 'metal', outline: 'empty'},
      {m: head, kind: 'metal', outline: 'all'},
      {m: collar, kind: 'fit', outline: 'none'},
      {m: cap, kind: 'fit', outline: 'all'}];
   const g = render(parts);

   // the cutting edge: the first column inside the outline on the left shines
   for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
         if (getp(g, x, y) !== '.' && has(head, x, y) && getp(g, x - 1, y) === 'o' && !has(head, x - 2, y) && getp(g, x, y) !== 'o') {
            setp(g, x, y, n >= 5 && (y % 2 === 0) ? 'w' : '4');
         }
      }
   }

   if (n >= 4) {
      // a gem set in the cheek
      gem2(g, 6, 3);
   }

   if (n >= 6) {
      // glowing veins across the bit
      for (const [x, y] of [[8, 2], [9, 3], [8, 5], [9, 4]]) {
         if (getp(g, x, y) !== '.' && getp(g, x, y) !== 'o') {
            setp(g, x, y, 'w');
         }
      }
   }

   if (n >= 7) {
      sparkle(g, 4, 2, false);
      sparkle(g, 12, 1, false);
   }

   return g;
}

const PICK_HEADS = [
   [ // tiers I-II (the arm towards the top-left; mirrored across the handle)
      '.....######.....',
      '...#########....',
      '..###########...',
      '..###.....####..',
      '..##............',
      '..#.............'],
   [ // tiers III-V: thicker arms
      '....#######.....',
      '..##########....',
      '.############...',
      '.############...',
      '.###......####..',
      '.##.............',
      '.#..............'],
   [ // tiers VI-VII: long hooked points, glowing veins
      '..#########.....',
      '.###########....',
      '#############...',
      '#############...',
      '###.......####..',
      '##..............',
      '##..............',
      '#...............']];

function pickaxe(n) {
   const lvl = n <= 2 ? 0 : n <= 5 ? 1 : 2;
   const head = rows(PICK_HEADS[lvl], true);
   const grip = mask((x, y, t, p) => t >= -13 && t <= 9 && (p === -1 || p === 0));
   const collar = n >= 2 ? mask((x, y, t, p) => (p === -1 || p === 0) && t >= 6 && t <= 7) : mask(() => false);
   const cap = n >= 4 ? mask((x, y) => (x === 1 && y === 14) || (x === 1 && y === 13) || (x === 0 && y === 14)) : mask(() => false);
   const parts = [
      {m: grip, kind: 'grip', wrap: n >= 3},
      {m: head, kind: 'metal', outline: 'all'},
      {m: collar, kind: 'fit', outline: 'none'},
      {m: cap, kind: 'fit', outline: 'all'}];
   const g = render(parts);

   if (n >= 4) {
      gem2(g, 12, 2);
   }

   if (n >= 5) {
      // glowing points
      for (const [x, y] of [[1, 3], [12, 14], [0, 4], [11, 15]]) {
         if (getp(g, x, y) === 'o') {
            setp(g, x, y, 'w');
         }
      }
   }

   if (n >= 6) {
      // glowing veins along the dark inner row of both arms
      for (let y = 0; y < 16; y++) {
         for (let x = 0; x < 16; x++) {
            if (getp(g, x, y) === '1' && (x + y) % 3 === 0) {
               setp(g, x, y, 'w');
            }
         }
      }
   }

   if (n >= 7) {
      sparkle(g, 6, 1, false);
      sparkle(g, 14, 9, false);
   }

   return g;
}

/**
 * A Dungeon Shard: one faceted crystal on the tool diagonal, its point to the top-right, broken (jagged) at the
 * bottom-left. Facets run along it (lit upper-left facet, a bright ridge, shaded lower-right facets) and the point's
 * facets are a step lighter. The same shape for every tier (it is a currency: the zone colour tells them apart);
 * tier V+ glows along the ridge, VII sparkles.
 */
function shard(n) {
   const tip = 12, half = 4, crown = 5;
   const broken = {'-4': 2, '-3': 1, '-2': 2, '-1': 0, 0: 1, 1: 0, 2: 2, 3: 1, 4: 3};
   const main = mask((x, y, t, p) => {
      const w = Math.min(half, Math.floor((tip - t) / 2), 2 + Math.floor((t + 10) / 2));
      return Math.abs(p) <= w && t >= -10 + (broken[p] || 0);
   });
   const g = render([{m: main, kind: 'metal', outline: 'all'}]);
   const lighter = {1: '2', 2: '3', 3: '4', 4: '4'};
   for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
         const t = T(x, y), p = P(x, y), r = getp(g, x, y);
         if (r === '.' || r === 'o') {
            continue;
         }

         let f = p <= -2 ? '3' : p === -1 ? '4' : p <= 1 ? '2' : '1';
         if (t >= crown) {
            f = lighter[f];
         }

         if (p === -1 && n >= 5 && t >= -7 && t < crown) {
            f = n >= 6 && ((t % 4) + 4) % 4 === 1 ? 'W' : 'w';
         }

         setp(g, x, y, f);
      }
   }

   if (n >= 7) {
      sparkle(g, 10, 4, false);
      sparkle(g, 5, 10, false);
      setp(g, 12, 2, 'W');
   }

   return g;
}

const DRAW = {sword, axe, pickaxe, shard};

/** What is drawn: the pack folder / model id of each tier, the custom_model_data string and the vanilla item it is on. */
const KINDS = [
   {key: 'sword', item: 'netherite_sword', parent: 'minecraft:item/handheld', id: n => 'gear/sword_' + n, when: n => 'vortex:gear/sword_' + n},
   {key: 'axe', item: 'netherite_axe', parent: 'minecraft:item/handheld', id: n => 'gear/axe_' + n, when: n => 'vortex:gear/axe_' + n},
   {key: 'pickaxe', item: 'netherite_pickaxe', parent: 'minecraft:item/handheld', id: n => 'gear/pickaxe_' + n, when: n => 'vortex:gear/pickaxe_' + n},
   {key: 'shard', item: 'amethyst_shard', parent: 'minecraft:item/generated', id: n => 'shard/' + n, when: n => 'vortex:shard/' + n}];
const ROWS = KINDS.map(k => k.key);

// ---- colours / PNG -----------------------------------------------------------------------------------------------------

function hex(h) {
   const v = parseInt(h.slice(1), 16);
   return [v >> 16 & 255, v >> 8 & 255, v & 255, 255];
}

function colours(n) {
   const t = TIERS[n - 1];
   const c = {
      o: t.main[0], 1: t.main[1], 2: t.main[2], 3: t.main[3], 4: t.main[4],
      q: t.fit[0], f: t.fit[1], F: t.fit[2],
      k: t.grip[0], h: t.grip[1], H: t.grip[2],
      j: t.gem[0], J: t.gem[1], x: t.gem[2],
      w: t.glow[0], W: t.glow[1], s: '#ffffff'};
   const out = {};
   for (const k of Object.keys(c)) {
      out[k] = hex(c[k]);
   }

   return out;
}

function toRgba(g, n) {
   const c = colours(n);
   const buf = Buffer.alloc(256 * 4);
   g.forEach((r, k) => {
      if (r !== '.') {
         const v = c[r];
         if (!v) {
            throw new Error('no colour for role ' + r);
         }

         buf[k * 4] = v[0];
         buf[k * 4 + 1] = v[1];
         buf[k * 4 + 2] = v[2];
         buf[k * 4 + 3] = v[3];
      }
   });
   return buf;
}

function encodePng(w, h, rgba) {
   const raw = Buffer.alloc((w * 4 + 1) * h);
   for (let y = 0; y < h; y++) {
      raw[y * (w * 4 + 1)] = 0;
      rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
   }

   const chunk = (type, data) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(zlib.crc32(td) >>> 0);
      return Buffer.concat([len, td, crc]);
   };
   const ihdr = Buffer.alloc(13);
   ihdr.writeUInt32BE(w, 0);
   ihdr.writeUInt32BE(h, 4);
   ihdr[8] = 8;
   ihdr[9] = 6;
   return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw, {level: 9})), chunk('IEND', Buffer.alloc(0))]);
}

// ---- pack files --------------------------------------------------------------------------------------------------------

function writeFile(rel, data) {
   const f = path.join(PACK, rel);
   fs.mkdirSync(path.dirname(f), {recursive: true});
   fs.writeFileSync(f, data);
}

/**
 * assets/minecraft/items/<item>.json: a select on custom_model_data index 0. Cases already in the file are kept (ours
 * are replaced in place / appended), and so is its fallback; a new file falls back to the vanilla model.
 */
function definition(item, cases) {
   const rel = 'assets/minecraft/items/' + item + '.json';
   const file = path.join(PACK, rel);
   const vanilla = {type: 'minecraft:model', model: 'minecraft:item/' + item};
   let def = {model: {type: 'minecraft:select', property: 'minecraft:custom_model_data', index: 0, cases: [], fallback: vanilla}};
   if (fs.existsSync(file)) {
      const old = JSON.parse(fs.readFileSync(file, 'utf8'));
      const m = old.model || {};
      if (m.type === 'minecraft:select' && m.property === 'minecraft:custom_model_data' && (m.index || 0) === 0) {
         def = old;
         def.model.cases = def.model.cases || [];
         def.model.fallback = def.model.fallback || vanilla;
      } else {
         // any other definition becomes the fallback of our select
         def.model.fallback = m;
      }
   }

   const list = def.model.cases;
   for (const [when, model] of cases) {
      const c = {when, model: {type: 'minecraft:model', model}};
      const i = list.findIndex(e => e.when === when);
      if (i >= 0) {
         list[i] = c;
      } else {
         list.push(c);
      }
   }

   writeJson(rel, def);
   return list.length;
}

/** Writes a JSON file unless the file already holds the same JSON (an existing file keeps its layout). */
function writeJson(rel, obj) {
   const file = path.join(PACK, rel);
   if (fs.existsSync(file)) {
      try {
         if (JSON.stringify(JSON.parse(fs.readFileSync(file, 'utf8'))) === JSON.stringify(obj)) {
            return;
         }
      } catch (e) {
         // unreadable: rewrite it
      }
   }

   writeFile(rel, JSON.stringify(obj, null, 2) + '\n');
}

// ---- preview -----------------------------------------------------------------------------------------------------------

const FONT = {
   A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110', C: '01110100011000010000100001000101110',
   D: '11110100011000110001100011000111110', E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000',
   G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001', I: '01110001000010000100001000010001110',
   J: '00111000100001000010000101001001100', K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111',
   M: '10001110111010110101100011000110001', N: '10001100011100110101100111000110001', O: '01110100011000110001100011000101110',
   P: '11110100011000111110100001000010000', Q: '01110100011000110001101011001001101', R: '11110100011000111110101001001010001',
   S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100', U: '10001100011000110001100011000101110',
   V: '10001100011000101010010100010000100', W: '10001100011000110101101011010101010', X: '10001100010101000100010101000110001',
   Y: '10001100010101000100001000010000100', Z: '11111000010001000100010001000011111', ' ': '00000000000000000000000000000000000',
   '-': '00000000000000011111000000000000000',
   0: '01110100011001110101110011000101110', 1: '00100011000010000100001000010001110', 2: '01110100010000100010001000100011111',
   3: '11111000100010000010000011000101110', 4: '00010001100101010010111110001000010', 5: '11111100001111000001000011000101110',
   6: '00110010001000011110100011000101110', 7: '11111000010001000100010000100001000', 8: '01110100011000101110100011000101110',
   9: '01110100011000101111000010001001100', '(': '00010001000100001000010000010000010', ')': '01000001000001000010000100010001000',
   '.': '00000000000000000000000000110001100', ',': '00000000000000000000001100010001000', '=': '00000000001111100000111110000000000', ':': '00000001000010000000001000010000000', '/': '00001000010001000100010001000010000'};

class Image {
   constructor(w, h, bg) {
      this.w = w;
      this.h = h;
      this.d = Buffer.alloc(w * h * 4);
      if (bg) {
         this.fill(0, 0, w, h, bg);
      }
   }

   px(x, y, c, a = 1) {
      x |= 0;
      y |= 0;
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) {
         return;
      }

      const k = (y * this.w + x) * 4;
      for (let i = 0; i < 3; i++) {
         this.d[k + i] = Math.round(this.d[k + i] * (1 - a) + c[i] * a);
      }

      this.d[k + 3] = 255;
   }

   fill(x0, y0, w, h, c) {
      for (let y = y0; y < y0 + h; y++) {
         for (let x = x0; x < x0 + w; x++) {
            this.px(x, y, c);
         }
      }
   }

   text(s, x0, y0, scale, c) {
      let x = x0;
      for (const ch of s.toUpperCase()) {
         const g = FONT[ch] || FONT[' '];
         for (let i = 0; i < 35; i++) {
            if (g[i] === '1') {
               this.fill(x + (i % 5) * scale, y0 + Math.floor(i / 5) * scale, scale, scale, c);
            }
         }

         x += 6 * scale;
      }
   }

   sprite(rgba, x0, y0, scale) {
      for (let k = 0; k < 256; k++) {
         if (rgba[k * 4 + 3]) {
            this.fill(x0 + (k % 16) * scale, y0 + Math.floor(k / 16) * scale, scale, scale, [rgba[k * 4], rgba[k * 4 + 1], rgba[k * 4 + 2]]);
         }
      }
   }

   png() {
      return encodePng(this.w, this.h, this.d);
   }
}

/**
 * An in-hand style render of a 16x16 sprite: the item lifted as the generated (extruded) handheld model shows it, tilted
 * and given 1/16 depth, drawn from back to front with the side faces darkened.
 */
function inHand(img, rgba, cx, cy, size, angle, tilt) {
   const cos = Math.cos(angle), sin = Math.sin(angle);
   const depth = Math.max(2, Math.round(size / 16));
   const sx = Math.cos(tilt), sh = Math.sin(tilt) * 0.35;
   // inverse map: screen -> sprite
   const sample = (X, Y, ox, oy) => {
      let u = (X - cx - ox), v = (Y - cy - oy);
      u /= sx;
      v -= u * sh;
      const a = (u * cos + v * sin) / size * 16 + 8, b = (-u * sin + v * cos) / size * 16 + 8;
      if (a < 0 || b < 0 || a >= 16 || b >= 16) {
         return null;
      }

      const k = (Math.floor(b) * 16 + Math.floor(a)) * 4;
      return rgba[k + 3] ? [rgba[k], rgba[k + 1], rgba[k + 2]] : null;
   };
   const r = size;
   for (let d = depth; d >= 0; d--) {
      const ox = d * 0.9, oy = d * 0.9;
      for (let Y = cy - r; Y < cy + r; Y++) {
         for (let X = cx - r; X < cx + r; X++) {
            const c = sample(X, Y, ox, oy);
            if (c) {
               const f = d === 0 ? 1 : 0.55;
               img.px(X, Y, [c[0] * f, c[1] * f, c[2] * f]);
            }
         }
      }
   }
}

function preview(out, sprites) {
   const S = 8, cell = 16 * S, pad = 16, left = 112, headH = 52;
   const cols = 7, rowsN = ROWS.length;
   const W = left + cols * (cell + pad) + pad;
   const panelH = headH + rowsN * (cell + pad) + pad;
   const handH = 320;
   const sizeH = 34 + 2 * (ROWS.length * (48 + 4) + 16);
   const H = 44 + panelH * 2 + sizeH + 44 + handH + pad;
   const img = new Image(W, H, [20, 18, 26]);
   img.text('VORTEX SKYBLOCK - DUNGEON GEAR TOOLS AND SHARDS I-VII (16X16, SHOWN 8X)', pad, 14, 2, [235, 225, 255]);
   const panels = [{y: 44, bg: [30, 28, 36], card: [42, 39, 50], fg: [220, 214, 235]},
      {y: 44 + panelH, bg: [228, 226, 234], card: [204, 202, 212], fg: [40, 36, 52]}];
   for (const pn of panels) {
      img.fill(0, pn.y, W, panelH, pn.bg);
      for (let n = 1; n <= 7; n++) {
         const x = left + (n - 1) * (cell + pad);
         img.text(ROMAN[n - 1], x, pn.y + 12, 2, hex(TIERS[n - 1].main[3]));
         img.text(TIERS[n - 1].name, x, pn.y + 32, 2, pn.fg);
      }

      ROWS.forEach((piece, r) => {
         const y = pn.y + headH + r * (cell + pad);
         img.text(piece, pad, y + cell / 2 - 7, 2, pn.fg);
         for (let n = 1; n <= 7; n++) {
            const x = left + (n - 1) * (cell + pad);
            img.fill(x - 4, y - 4, cell + 8, cell + 8, pn.card);
            img.sprite(sprites[piece][n], x, y, S);
         }
      });
   }

   // actual size (1x, 2x, 3x: the inventory at GUI scale 1-3) on both backgrounds
   const sy = 44 + panelH * 2;
   const bandH = ROWS.length * (48 + 4) + 16;
   img.fill(0, sy, W, 34 + bandH, [30, 28, 36]);
   img.fill(0, sy + 34 + bandH, W, bandH, [228, 226, 234]);
   img.text('ACTUAL SIZE: 1X 2X 3X (INVENTORY AT GUI SCALE 1-3)', pad, sy + 12, 2, [220, 214, 235]);
   [0, 1].forEach(side => {
      let x = pad;
      const y0 = sy + 34 + side * bandH + 8;
      [1, 2, 3].forEach(sc => {
         ROWS.forEach((piece, r) => {
            for (let n = 1; n <= 7; n++) {
               img.sprite(sprites[piece][n], x + (n - 1) * (16 * sc + 4), y0 + r * (16 * sc + 4), sc);
            }
         });
         x += 7 * (16 * sc + 4) + 24;
      });
   });

   // three in-hand style renders
   const hy = 44 + panelH * 2 + sizeH;
   img.text('IN-HAND STYLE (EXTRUDED LIKE THE HANDHELD MODEL)', pad, hy + 14, 2, [235, 225, 255]);
   const picks = [['sword', 7], ['axe', 5], ['pickaxe', 6]];
   const pw = Math.floor((W - pad) / 3) - pad;
   picks.forEach(([piece, n], i) => {
      const x0 = pad + i * (pw + pad), y0 = hy + 44;
      // a dungeon backdrop: dark stone with the zone colour glowing from below
      const glow = hex(TIERS[n - 1].glow[0]);
      for (let y = 0; y < handH; y++) {
         const f = y / handH;
         for (let x = 0; x < pw; x++) {
            const base = [26 + 10 * f, 24 + 8 * f, 32 + 10 * f];
            const a = Math.max(0, f - 0.4) * 0.6;
            img.px(x0 + x, y0 + y, [base[0] * (1 - a) + glow[0] * a, base[1] * (1 - a) + glow[1] * a, base[2] * (1 - a) + glow[2] * a]);
         }
      }

      inHand(img, sprites[piece][n], x0 + pw * 0.55, y0 + handH * 0.46, 210, -0.3, 0.45);
      img.text(ROMAN[n - 1] + ' ' + TIERS[n - 1].name + ' ' + piece, x0 + 10, y0 + handH - 24, 2, [240, 236, 250]);
   });
   fs.mkdirSync(path.dirname(out), {recursive: true});
   fs.writeFileSync(out, img.png());
}

// ---- main --------------------------------------------------------------------------------------------------------------

const PACK = path.resolve(process.argv[2] || '.');
const PREVIEW = process.argv[3];
const sprites = {};
const ascii = [];
for (const kind of KINDS) {
   sprites[kind.key] = {};
   const cases = [];
   for (let n = 1; n <= 7; n++) {
      const id = kind.id(n);
      const g = DRAW[kind.key](n);
      const rgba = toRgba(g, n);
      sprites[kind.key][n] = rgba;
      ascii.push(id);
      for (let y = 0; y < 16; y++) {
         ascii.push(g.slice(y * 16, y * 16 + 16).join(''));
      }

      writeFile('assets/vortex/textures/item/' + id + '.png', encodePng(16, 16, rgba));
      writeJson('assets/vortex/models/item/' + id + '.json', {parent: kind.parent, textures: {layer0: 'vortex:item/' + id}});
      cases.push([kind.when(n), 'vortex:item/' + id]);
   }

   const total = definition(kind.item, cases);
   console.log(kind.item + '.json: ' + total + ' cases');
}

if (PREVIEW) {
   preview(PREVIEW, sprites);
   fs.writeFileSync(PREVIEW.replace(/\.png$/i, '') + '-grids.txt', ascii.join('\n') + '\n');
   console.log('preview: ' + PREVIEW);
}
