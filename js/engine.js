"use strict";
/* Game engine: storage, accounts, player logic, combat, shop, crafting, debug console.
   Pure logic — no DOM. The UI calls into G.* and reads G.events for notifications. */

const D = DATA;
const SAVE_KEY = 'dunes_intred_save_v1';

// ---------- utils ----------
const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const randFloat = (a, b) => Math.random() * (b - a) + a;
const choice = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function weightedChoice(arr, w) {
  const total = arr.reduce((s, x) => s + w(x), 0);
  let r = Math.random() * total;
  for (const x of arr) { r -= w(x); if (r <= 0) return x; }
  return arr[arr.length - 1];
}
function sample(arr, n) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = randInt(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); }
function hashPw(s) { // cyrb53 — not cryptographic, just avoids storing plain text
  let h1 = 0xdeadbeef ^ s.length, h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) { const ch = s.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 'h:' + (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16);
}
const deepClone = o => JSON.parse(JSON.stringify(o));

// ---------- storage ----------
const Store = {
  data: null,
  load(fromMemory) {   // fromMemory: data already set (tab sync) — normalise only, don't re-save
    if (!fromMemory) { try { this.data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { this.data = null; } }
    if (!this.data || typeof this.data !== 'object') this.data = {};
    const d = this.data;
    if (!d.users || typeof d.users !== 'object') d.users = {};
    if (!d.treasure || typeof d.treasure !== 'object') d.treasure = { money: 0, items: [] };
    if (typeof d.treasure.money !== 'number') d.treasure.money = 0;
    if (!Array.isArray(d.treasure.items)) d.treasure.items = [];
    if (d.treasure.money < BAL.TREASURE_MIN) d.treasure.money = randInt(BAL.TREASURE_MIN, BAL.TREASURE_MAX);
    if (!('remember' in d)) d.remember = null;
    if (!d.trades || typeof d.trades !== 'object') d.trades = {};
    if (!d.notifications || typeof d.notifications !== 'object') d.notifications = {};
    for (const u of Object.values(d.users)) {
      u.player = normalizePlayer(u.player);
      if (!u.profile || typeof u.profile !== 'object') u.profile = {};
      u.profile = Object.assign({ bio: '', showcase: [], banner: '#2b3a67' }, u.profile);
      if (!('avatar' in u)) u.avatar = null;   // null = not customised yet -> avatar creator opens
    }
    if (!fromMemory) this.save();
  },
  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); return true; }
    catch (e) { console.error('Save failed', e); return false; }
  },
};

// ---------- player defaults ----------
function defaultPlayer() {
  return {
    level: 1, exp: 0, hp: 100, mana: 100,
    base: { hp_max: 100, mana_max: 100, atk: 5, def: 0 },
    perm: { atk: 0, def: 0, hp: 0, mana: 0, magic_def: 0, crit: 0, mana_regen: 0, lifesteal: 0, lifesteal_chance: 0, exp: 0, exp_gain: 0 },
    area: 1,
    equipped: { weapon: 'wooden_sword', armor: 'leather_armor', wand: null, robe: null, necklace: null },
    inventory: { potion: 1, wooden_sword: 1, leather_armor: 1 },
    learned_spells: [], equipped_spells: [null, null, null, null],
    titles: ['novice'], equipped_titles: ['novice', null, null, null, null],
    achievements: [],
    counters: { monsters_defeated: 0, bosses_defeated: 0, total_money_earned: 0, items_crafted: 0, materials_collected: 0, times_died: 0, dungeon_treasure_collected: 0, critical_hits: 0 },
    dodge: 3, max_dodge: 3, dodge_progress: 0,
    buffs: [],
    settings: { call_including_title: true, show_exp_bar: true, auto_equip_spells: false, auto_equip_titles: false, auto_equip_everything: false },
  };
}
function normalizePlayer(p) {
  const def = defaultPlayer();
  if (!p || typeof p !== 'object') return def;
  for (const [k, v] of Object.entries(def)) {
    if (!(k in p) || p[k] === null || typeof p[k] !== typeof v) { p[k] = deepClone(v); continue; }
    if (v && typeof v === 'object' && !Array.isArray(v) && k !== 'inventory') {
      for (const [k2, v2] of Object.entries(v)) if (!(k2 in p[k])) p[k][k2] = v2;
    }
  }
  while (p.equipped_spells.length < 4) p.equipped_spells.push(null);
  { const seen = {}; p.buffs = p.buffs.filter(b => { if (!['exp_mult', 'coin_mult'].includes(b.type)) return true; const k = b.type + b.amount; if (seen[k]) { seen[k].remaining += b.remaining; return false; } seen[k] = b; return true; }); }
  while (p.equipped_titles.length < 5) p.equipped_titles.push(null);
  clampInventory(p);
  for (const b of p.buffs) if (typeof b.remaining !== 'number' || !isFinite(b.remaining)) b.remaining = 1; else if (b.remaining > BAL.MAX_MULT_BATTLES) b.remaining = BAL.MAX_MULT_BATTLES;
  return p;
}

// keep every stack a whole number between 1 and BAL.MAX_STACK
function clampInventory(p) {
  for (const [k, v] of Object.entries(p.inventory)) {
    const n = Math.floor(Number(v));
    if (!isFinite(n) || n <= 0) delete p.inventory[k];
    else p.inventory[k] = Math.min(n, BAL.MAX_STACK);
  }
}
// sanitise a quantity coming from the UI / commands: whole number, at least 1, at most `max`
const cleanQty = (q, max) => { const n = Math.floor(Number(q)); return Math.max(1, Math.min(isFinite(n) ? n : 1, max)); };

// ---------- the game ----------
const G = {
  user: null,
  fight: null,
  events: [],
  forcedMonster: null,
  get p() { return this.user ? this.user.player : null; },
  get treasure() { return Store.data.treasure; },
  notify(msg, type = 'info') { this.events.push({ msg, type }); },
  save() { Store.save(); },

  // ===== accounts =====
  signup(username, password) {
    const u = (username || '').trim().toLowerCase();
    if (!u || !password || !password.trim()) return { ok: false, msg: 'Username and password cannot be empty.' };
    if (!/^[a-z0-9_.-]{3,20}$/.test(u)) return { ok: false, msg: 'Username must be 3–20 characters: letters, numbers, _ . -' };
    if (Store.data.users[u]) return { ok: false, msg: 'Username already exists!' };
    Store.data.users[u] = { username: u, password: hashPw(password), score: 0, money: 40, player: defaultPlayer(), created: Date.now(), avatar: null, profile: { bio: '', showcase: [], banner: '#2b3a67' } };
    this.save();
    return { ok: true };
  },
  login(username, password) {
    const u = (username || '').trim().toLowerCase();
    const acc = Store.data.users[u];
    if (!acc || (acc.password !== hashPw(password) && acc.password !== password)) return { ok: false, msg: 'Wrong username or password.' };
    if (acc.password === password) acc.password = hashPw(password); // migrate plain text
    this.user = acc; this.fight = null;
    this.onLoad();
    return { ok: true };
  },
  loginRemembered() {
    const u = Store.data.remember;
    if (!u || !Store.data.users[u]) return false;
    this.user = Store.data.users[u]; this.fight = null; this.onLoad();
    return true;
  },
  setRemember(on) { Store.data.remember = on && this.user ? this.user.username : null; this.save(); },
  logout() { this.fight = null; this.user = null; this.save(); },
  onLoad() {
    normalizePlayer(this.user.player);
    this.unlockLevelTitles();
    this.checkAchievements(true);
    this.clampVitals();
    this.save();
  },
  power(p) { const d = this.derive(p); return Math.floor(d.atk + d.def * 1.5 + d.hpMax / 5 + d.manaMax / 10 + d.magicAtk * 2 + d.magicDef * 1.5 + d.crit * 10); },
  LB_TYPES: {
    score:  { label: 'Score',        what: 'Score earned from defeating monsters & bosses and the guessing game (spending score on gear lowers it).', get: u => u.score },
    level:  { label: 'Level',        what: 'Character level (max 7500). Ties are broken by EXP.', get: u => u.player.level + u.player.exp / (G.expToNext(u.player.level) || 1) / 10 },
    power:  { label: 'Power',        what: 'Combat power — a mix of ATK, DEF, HP, Mana, magic stats and crit from gear, titles and upgrades.', get: u => G.power(u.player) },
    money:  { label: 'Wealth',       what: 'Money currently held.', get: u => u.money },
    kills:  { label: 'Monsters',     what: 'Total monsters defeated (bosses included).', get: u => u.player.counters.monsters_defeated },
    bosses: { label: 'Bosses',       what: 'Total bosses defeated.', get: u => u.player.counters.bosses_defeated },
  },
  leaderboard(type = 'score', limit = 10) {
    const t = this.LB_TYPES[type] || this.LB_TYPES.score;
    return Object.values(Store.data.users).map(u => ({ name: u.username, score: u.score, level: u.player.level, title: this.displayTitle(u.player), avatar: u.avatar, value: t.get(u), money: u.money }))
      .sort((a, b) => b.value - a.value).slice(0, limit);
  },
  changePassword(oldPw, newPw) {
    if (this.user.password !== hashPw(oldPw)) return { ok: false, msg: 'Current password is wrong.' };
    if (!newPw.trim()) return { ok: false, msg: 'New password cannot be empty.' };
    this.user.password = hashPw(newPw); this.save(); return { ok: true };
  },
  deleteAccount() {
    const me = this.user.username;
    for (const t of Object.values(Store.data.trades)) if (t.status === 'pending' && (t.from === me || t.to === me)) { t.status = 'cancelled'; t.updated = Date.now(); this.notifyUser(t.from === me ? t.to : t.from, `Trade with ${me} was cancelled (account deleted).`, 'trade', { tradeId: t.id }); }
    delete Store.data.notifications[me];
    delete Store.data.users[this.user.username];
    if (Store.data.remember === this.user.username) Store.data.remember = null;
    this.user = null; this.fight = null; this.save();
  },

  // ===== titles / derived stats =====
  titleBonus(p = this.p) {
    const t = {};
    for (const k of p.equipped_titles) if (k && D.TITLES[k]) for (const [f, v] of Object.entries(D.TITLES[k])) if (typeof v === 'number') t[f] = (t[f] || 0) + v;
    return t;
  },
  derive(p = this.p) {
    const eq = p.equipped;
    const w = D.WEAPONS[eq.weapon] || {}, a = D.ARMORS[eq.armor] || {}, wd = D.WANDS[eq.wand] || {}, r = D.ROBES[eq.robe] || {}, n = D.NECKLACES[eq.necklace] || {};
    const t = this.titleBonus(p);
    const buff = type => p.buffs.filter(b => b.type === type).reduce((s, b) => s + b.amount, 0);
    const pct = x => 1 + (x || 0) / 100;
    return {
      atk: Math.floor((p.base.atk + (w.atk || 0) + (n.atk_bonus || 0) + (t.atk_boost || 0) + buff('atk')) * pct(t.atk_percent)) + p.perm.atk,
      def: Math.floor((p.base.def + (a.def || 0) + (n.def_bonus || 0) + (t.def_boost || 0) + buff('def')) * pct(t.def_percent)) + p.perm.def,
      hpMax: Math.floor((p.base.hp_max + (n.hp_bonus || 0) + (t.hp_boost || 0)) * pct(t.hp_percent)) + p.perm.hp,
      manaMax: Math.floor((p.base.mana_max + (n.mana_bonus || 0) + (t.mana_boost || 0)) * pct(t.mana_percent)) + p.perm.mana,
      magicAtk: (wd.magic_atk || 0) + (n.magic_atk_bonus || 0),
      magicDef: (r.magic_def || 0) + (n.magic_def_bonus || 0) + p.perm.magic_def,
      crit: clamp(p.perm.crit + (n.crit_bonus || 0) + (t.crit_chance_percent || 0) + buff('crit'), 0, 100),
      lifestealFlat: n.lifesteal_bonus || 0,                // always-on % from necklace
      lifestealPct: p.perm.lifesteal, lifestealChance: clamp(p.perm.lifesteal_chance, 0, 100),
      manaRegen: p.perm.mana_regen + buff('mana_regen'),
      hpRegen: buff('hp_regen'),
      expBoost: p.perm.exp + (t.exp_boost || 0),
      expGain: p.perm.exp_gain || 0,
      expMult: Math.max(1, ...p.buffs.filter(b => b.type === 'exp_mult').map(b => b.amount)),
      coinMult: Math.max(1, ...p.buffs.filter(b => b.type === 'coin_mult').map(b => b.amount)),
      moneyBoost: t.money_boost_percent || 0,
      materialBoost: t.material_boost_percent || 0,
      treasureBoost: t.treasure_boost_percent || 0,
      materialDiscount: t.material_discount_percent || 0,
      deathPenalty: t.death_penalty_percent || 0,
      recovery: Math.min(BAL.MAX_RECOVERY, BAL.BASE_RECOVERY + (a.heal_pct || 0) + (t.hp_regen_percent || 0)),
    };
  },
  clampVitals() {
    const p = this.p, d = this.derive();
    p.hp = clamp(Math.round(p.hp), 0, d.hpMax);
    p.mana = clamp(Math.round(p.mana), 0, d.manaMax);
    if (p.hp < 1 && !this.fight) p.hp = d.hpMax; // check_stats from original
  },
  levelTitleKey(level) { for (const [max, key] of D.LEVEL_TITLES) if (level <= max) return key; return 'novice'; },
  displayTitle(p = this.p) {
    const eq = p.equipped_titles.filter(Boolean).sort((a, b) => this.titleValue(b) - this.titleValue(a));
    const k = eq[0] || this.levelTitleKey(p.level);
    return D.TITLES[k] ? D.TITLES[k].name : '';
  },
  displayName() {
    const p = this.p;
    return p.settings.call_including_title ? `${this.displayTitle()} ${this.user.username}` : this.user.username;
  },
  unlockLevelTitles() {
    const p = this.p;
    for (const [max, key] of D.LEVEL_TITLES) {
      const idx = D.LEVEL_TITLES.findIndex(x => x[1] === key);
      const minLvl = idx === 0 ? 1 : D.LEVEL_TITLES[idx - 1][0] + 1;
      if (p.level >= minLvl && !p.titles.includes(key)) { p.titles.push(key); this.notify(`New title unlocked: ${D.TITLES[key].name}`, 'title'); }
    }
    if (p.settings.auto_equip_titles || p.settings.auto_equip_everything) this.autoEquipTitles();
  },
  checkAchievements(silent = false) {
    const p = this.p; let any = false;
    for (const [k, a] of Object.entries(D.ACHIEVEMENTS)) {   // (original loop body was mis-indented: only checked the last one)
      if (!p.achievements.includes(k) && a.cond(p)) {
        p.achievements.push(k); any = true;
        if (!silent) this.notify(`🏆 Achievement: ${a.name} — ${a.desc}`, 'achievement');
        const tk = D.titleKeyByName(a.title);
        if (tk && !p.titles.includes(tk)) { p.titles.push(tk); if (!silent) this.notify(`New title unlocked: ${a.title}`, 'title'); }
      }
    }
    if (any && (p.settings.auto_equip_titles || p.settings.auto_equip_everything)) this.autoEquipTitles();
  },
  titleValue(k) {
    const t = D.TITLES[k]; if (!t) return 0;
    return t.atk_boost * 3 + t.def_boost * 3 + t.hp_boost + t.mana_boost + t.exp_boost * 2 + (t.hp_regen_percent || 0) * 4 + (t.atk_percent + t.def_percent + t.hp_percent + t.mana_percent) * 4
      + (t.money_boost_percent + t.material_boost_percent + t.treasure_boost_percent + t.material_discount_percent + t.crit_chance_percent) * 3 - t.death_penalty_percent * 2;
  },
  autoEquipTitles() {
    const p = this.p;
    const best = p.titles.slice().sort((a, b) => this.titleValue(b) - this.titleValue(a)).slice(0, 5);
    p.equipped_titles = [0, 1, 2, 3, 4].map(i => best[i] || null);
    this.clampVitals();
  },
  equipTitle(key) {
    const p = this.p;
    if (!p.titles.includes(key)) return { ok: false, msg: 'Title not unlocked.' };
    if (p.equipped_titles.includes(key)) return { ok: false, msg: 'Already equipped.' };
    const slot = p.equipped_titles.indexOf(null);
    if (slot < 0) return { ok: false, msg: 'All 5 title slots are full. Unequip one first.' };
    p.equipped_titles[slot] = key; this.clampVitals(); this.save();
    return { ok: true, msg: `Equipped title ${D.TITLES[key].name}.` };
  },
  unequipTitle(slot) { this.p.equipped_titles[slot] = null; this.clampVitals(); this.save(); },

  // ===== exp =====
  expToNext(level) { return level >= BAL.MAX_LEVEL ? Infinity : Math.floor(40 * Math.pow(level, 1.6)); },
  areaMinLevel(area) { return (area - 1) * BAL.LEVELS_PER_AREA + 1; },
  grantExp(amount) {
    const p = this.p, d = this.derive();
    let gained = Math.round(amount * (1 + d.expBoost / 100) * (1 + d.expGain / 100) * d.expMult);
    const levels = [];
    if (p.level >= BAL.MAX_LEVEL) return { gained: 0, levels };
    p.exp += gained;
    while (p.level < BAL.MAX_LEVEL && p.exp >= this.expToNext(p.level)) {
      p.exp -= this.expToNext(p.level);
      p.level += 1;
      p.base.hp_max += 10;
      p.base.atk += 1 + Math.floor(p.level / 5);
      p.base.mana_max += 10;
      p.base.def += 1;
      p.max_dodge = Math.min(10, p.max_dodge + 1);
      const nd = this.derive();
      p.hp = Math.min(p.hp + Math.floor(nd.hpMax / 4), nd.hpMax);
      p.mana = Math.min(p.mana + Math.floor(nd.manaMax / 3), nd.manaMax);
      levels.push(p.level);
    }
    if (p.level >= BAL.MAX_LEVEL) p.exp = 0;
    if (levels.length) {
      this.unlockLevelTitles();
      if (p.settings.auto_equip_everything) this.autoEquipItems();
      if (p.settings.auto_equip_spells || p.settings.auto_equip_everything) this.autoEquipSpells();
    }
    return { gained, levels };
  },

  // ===== inventory =====
  inv(key) { return this.p.inventory[key] || 0; },
  room(key) { return Math.max(0, BAL.MAX_STACK - this.inv(key)); },
  // returns how many were actually added (stacks are capped at BAL.MAX_STACK)
  addItem(key, qty = 1) {
    const inv = this.p.inventory;
    const add = Math.min(Math.floor(qty), BAL.MAX_STACK - (inv[key] || 0));
    if (add > 0) inv[key] = (inv[key] || 0) + add;
    if (inv[key] <= 0) delete inv[key];
    return Math.max(0, add);
  },
  removeItem(key, qty = 1) {
    const inv = this.p.inventory; inv[key] = (inv[key] || 0) - qty;
    if (inv[key] <= 0) {
      delete inv[key];
      const it = D.ITEMS[key];
      if (it && this.p.equipped[it.cat] === key) this.p.equipped[it.cat] = null;
    }
  },
  equipItem(key) {
    const it = D.ITEMS[key];
    if (!it || !(it.cat in this.p.equipped)) return { ok: false, msg: 'Not equipment.' };
    if (this.inv(key) < 1) return { ok: false, msg: "You don't own that." };
    this.p.equipped[it.cat] = key; this.clampVitals(); this.save();
    return { ok: true, msg: `Equipped ${it.name}.` };
  },
  unequip(slot) { this.p.equipped[slot] = null; this.clampVitals(); this.save(); },
  bestEquipment(cat) {
    let best = null;
    for (const k of Object.keys(this.p.inventory)) { const it = D.ITEMS[k]; if (it && it.cat === cat && (!best || it.power > best.power)) best = it; }
    return best;
  },
  autoEquipItems(cats = ['weapon', 'armor', 'wand', 'robe', 'necklace']) {
    for (const c of cats) { const b = this.bestEquipment(c); if (b) this.p.equipped[c] = b.key; }
    this.clampVitals();
  },

  // potions & buffs (usable in and out of combat)
  useConsumable(key, qty = 1) {
    const p = this.p, it = D.ITEMS[key];
    if (!it || (it.cat !== 'potion' && it.cat !== 'buff')) return { ok: false, msg: 'Cannot use that.' };
    if (this.inv(key) < 1) return { ok: false, msg: `No ${it.name} left.` };
    const wanted = Math.floor(Number(qty)) || 1;
    qty = cleanQty(qty, Math.min(this.inv(key), BAL.USE_LIMIT));
    const pot = D.POTIONS[key], d = this.derive();
    let used = 0; const msgs = [];
    for (let i = 0; i < qty; i++) {
      if (pot.effect === 'heal') {
        if (p.hp >= d.hpMax) { if (!used) msgs.push('You are already at full HP.'); break; }
        const h = Math.min(pot.amount, d.hpMax - p.hp); p.hp += h; msgs.push(`${it.name}: +${h} HP`);
      } else if (pot.effect === 'heal_mana') {
        if (p.mana >= d.manaMax) { if (!used) msgs.push('You are already at full Mana.'); break; }
        const h = Math.min(pot.amount, d.manaMax - p.mana); p.mana += h; msgs.push(`${it.name}: +${h} Mana`);
      } else if (pot.effect === 'full_mana') {
        if (p.mana >= d.manaMax) { if (!used) msgs.push('You are already at full Mana.'); break; }
        p.mana = d.manaMax; msgs.push(`${it.name}: Mana fully restored`);
      } else {
        const type = pot.effect.slice(5);
        if (D.MULT_BUFFS.includes(type)) {
          // multiplier potions stack TIME: same multiplier -> add battles; others queue behind the strongest
          const same = p.buffs.find(b => b.type === type && b.amount === pot.amount);
          if (same && same.remaining + pot.duration > BAL.MAX_MULT_BATTLES) { if (!used) msgs.push(`That multiplier is already full (${BAL.MAX_MULT_BATTLES.toLocaleString()} battles stored).`); break; }
          if (same) same.remaining += pot.duration;
          else p.buffs.push({ type, amount: pot.amount, remaining: pot.duration, key, name: `${D.MULT_KINDS[pot.multKind].name} ×${pot.amount}` });
          const tot = (same || p.buffs[p.buffs.length - 1]).remaining;
          msgs.push(`${it.name}: ×${pot.amount.toLocaleString()} ${pot.multKind === 'exp' ? 'EXP' : 'coins'} — ${tot} battles stored`);
        } else {
          // identical buff used again this turn: merge into one entry (same total effect, no bloat)
          const twin = p.buffs.find(b => b.key === key && b.type === type && b.remaining === pot.duration);
          if (twin) twin.amount += pot.amount;
          else p.buffs.push({ type, amount: pot.amount, remaining: pot.duration, key, name: it.name });
          msgs.push(`${it.name}: +${pot.amount} ${type.replace('_', ' ')} for ${pot.duration} fights`);
        }
      }
      used++;
    }
    if (used) this.removeItem(key, used);
    this.clampVitals(); this.save();
    const capped = wanted > used && used === BAL.USE_LIMIT ? ` (limit ${BAL.USE_LIMIT.toLocaleString()} per click — ${this.inv(key).toLocaleString()} left)` : '';
    const summary = used > 1 ? `Used ${used.toLocaleString()}× ${it.name}.${capped}` : (msgs[0] || '');
    return { ok: used > 0, msg: used > 1 ? summary : msgs.join(' '), used };
  },
  useUpgrade(key, qty = 1) {
    const p = this.p, it = D.ITEMS[key];
    if (!it || it.cat !== 'upgrade') return { ok: false, msg: 'Not an upgrade.' };
    if (this.inv(key) < 1) return { ok: false, msg: 'None owned.' };
    qty = cleanQty(qty, Math.min(this.inv(key), BAL.UPGRADE_USE_LIMIT));
    const v = it.data[it.field] * qty;
    const map = { atk_increase: 'atk', def_increase: 'def', hp_increase: 'hp', magic_increase: 'mana', crit_chance_increase: 'crit', mana_regen_increase: 'mana_regen', magic_def_increase: 'magic_def', max_lifesteal_increase: 'lifesteal', lifesteal_chance_increase: 'lifesteal_chance', exp_increase: 'exp', exp_gain_increase: 'exp_gain' };
    p.perm[map[it.field]] += v;
    if (it.field === 'hp_increase') p.hp += v;
    if (it.field === 'magic_increase') p.mana += v;
    this.removeItem(key, qty); this.clampVitals(); this.checkAchievements(); this.save();
    const left = this.inv(key);
    return { ok: true, msg: `Used ${qty.toLocaleString()}× ${it.name}.${left ? ` (limit ${BAL.UPGRADE_USE_LIMIT.toLocaleString()} per click — ${left.toLocaleString()} left)` : ''}`, used: qty };
  },
  useAllUpgrades() {
    let total = 0, budget = BAL.UPGRADE_USE_LIMIT;
    for (const k of Object.keys(D.PERM_UPGRADES)) {
      const n = Math.min(this.inv(k), budget);
      if (n > 0) { this.useUpgrade(k, n); total += n; budget -= n; }
    }
    const left = Object.keys(D.PERM_UPGRADES).reduce((s, k) => s + this.inv(k), 0);
    return total ? { ok: true, msg: `Used ${total.toLocaleString()} permanent upgrades!${left ? ` (limit ${BAL.UPGRADE_USE_LIMIT.toLocaleString()} per click — ${left.toLocaleString()} left)` : ''}` } : { ok: false, msg: 'No permanent upgrades to use.' };
  },
  openPack(key, qty = 1) {
    const p = this.p, pack = D.MAGIC_PACKS[key];
    if (!pack) return { ok: false, msg: 'Unknown pack.' };
    if (this.inv(key) < 1) return { ok: false, msg: `You don't have any ${pack.name}.` };
    qty = cleanQty(qty, Math.min(this.inv(key), BAL.USE_LIMIT));
    this.removeItem(key, qty);
    const learned = []; let dups = 0;
    for (let i = 0; i < qty; i++) {
      const n = randInt(pack.drop_count[0], pack.drop_count[1]);
      for (let j = 0; j < n; j++) {
        const s = choice(pack.spells);
        if (!p.learned_spells.includes(s)) { p.learned_spells.push(s); learned.push(s); } else dups++;
      }
    }
    const refund = dups * (D.PACK_DUP_REFUND[key] || 0);
    this.user.money += refund;
    if (p.settings.auto_equip_spells || p.settings.auto_equip_everything) this.autoEquipSpells();
    this.checkAchievements(); this.save();
    return { ok: true, learned, dups, refund, opened: qty, left: this.inv(key), msg: learned.length ? `Learned: ${learned.map(s => D.SPELLS_BY_KEY[s].name).join(', ')}` : 'No new spells this time.' };
  },
  openAllPacks() {
    const res = { learned: [], dups: 0, refund: 0, opened: 0 };
    let budget = BAL.USE_LIMIT;
    for (const k of Object.keys(D.MAGIC_PACKS)) {
      const n = Math.min(this.inv(k), budget);
      if (n > 0) { const r = this.openPack(k, n); res.learned.push(...r.learned); res.dups += r.dups; res.refund += r.refund; res.opened += n; budget -= n; }
    }
    res.left = Object.keys(D.MAGIC_PACKS).reduce((s, k) => s + this.inv(k), 0);
    return res;
  },

  // ===== spells =====
  canUseSpell(key) { const s = D.SPELLS_BY_KEY[key]; return s && this.p.level >= s.lvl; },
  equipSpell(key, slot) {
    const p = this.p, s = D.SPELLS_BY_KEY[key];
    if (!s || !p.learned_spells.includes(key)) return { ok: false, msg: 'Spell not learned.' };
    if (p.level < s.lvl) return { ok: false, msg: `${s.name} requires level ${s.lvl}.` };
    const cur = p.equipped_spells.indexOf(key);
    if (slot === undefined || slot === null) {
      if (cur >= 0) return { ok: false, msg: 'Already equipped.' };
      slot = p.equipped_spells.indexOf(null);
      if (slot < 0) return { ok: false, msg: 'All 4 spell slots are full. Pick a slot to replace.' };
    }
    if (cur >= 0) p.equipped_spells[cur] = p.equipped_spells[slot]; // swap
    p.equipped_spells[slot] = key; this.save();
    return { ok: true, msg: `${s.name} → slot ${slot + 1}` };
  },
  unequipSpell(slot) { this.p.equipped_spells[slot] = null; this.save(); },
  autoEquipSpells() {
    const p = this.p;
    const usable = p.learned_spells.filter(k => this.canUseSpell(k));
    const isSupport = k => D.SPELLS_BY_KEY[k].effect !== 'damage' && D.SPELLS_BY_KEY[k].effect !== 'drain';
    const dmg = usable.filter(k => !isSupport(k)).sort((a, b) => D.SPELLS_BY_KEY[b].power - D.SPELLS_BY_KEY[a].power);
    const heal = usable.filter(k => isSupport(k)).sort((a, b) => D.SPELLS_BY_KEY[b].lvl - D.SPELLS_BY_KEY[a].lvl);
    const eq = [null, null, null, null];
    if (heal.length) { eq[3] = heal[0]; dmg.slice(0, 3).forEach((k, i) => eq[i] = k); }
    else dmg.slice(0, 4).forEach((k, i) => eq[i] = k);
    p.equipped_spells = eq; this.save();
  },

  // ===== shop =====
  buy(key, qty = 1) {
    const it = D.ITEMS[key], u = this.user;
    if (!it) return { ok: false, msg: 'Unknown item.' };
    qty = cleanQty(qty, BAL.MAX_STACK);
    const isEquip = it.cat in this.p.equipped;
    if (isEquip) {
      if (this.inv(key) > 0) return { ok: false, msg: 'You already own this item.' };
      if (u.money < it.price || u.score < it.score_price) return { ok: false, msg: 'Not enough money or score.' };
      u.money -= it.price; u.score -= it.score_price; this.addItem(key, 1);
      if (this.p.settings.auto_equip_everything) this.autoEquipItems([it.cat]);
      this.save();
      return { ok: true, msg: `Purchased ${it.name}!` };
    }
    const price = it.cat === 'pack' ? D.PACK_PRICES[key] : D.CONSUMABLE_PRICES[key];
    if (!price) return { ok: false, msg: 'Not sold here.' };
    if (this.room(key) < qty) return { ok: false, msg: this.room(key) ? `You can only hold ${BAL.MAX_STACK.toLocaleString()} — buy at most ${this.room(key).toLocaleString()} more.` : `Your ${it.name} stack is full (${BAL.MAX_STACK.toLocaleString()}).` };
    const total = price * qty;
    if (u.money < total) return { ok: false, msg: `Not enough money (need $${total.toLocaleString()}).` };
    u.money -= total; this.addItem(key, qty); this.save();
    return { ok: true, msg: `Purchased ${qty}× ${it.name} for $${total.toLocaleString()}!` };
  },
  sellPrice(key) {
    const it = D.ITEMS[key]; if (!it) return 0;
    if (it.cat === 'potion' || it.cat === 'buff') return Math.max(1, Math.floor((D.CONSUMABLE_PRICES[key] || 20) / 2));
    if (it.cat === 'material') return D.MATERIAL_SELL[it.rarity] || 5;
    if (it.cat === 'pack') return D.PACK_SELL[key] || 0;
    if (it.cat === 'upgrade') return 250;
    return Math.floor((it.price || 0) * 0.4);
  },
  sell(key, qty = 1) {
    const it = D.ITEMS[key]; if (!it) return { ok: false, msg: 'Unknown item.' };
    qty = Math.min(Math.max(1, Math.floor(qty)), this.inv(key));
    if (qty < 1) return { ok: false, msg: 'None owned.' };
    if (this.p.equipped[it.cat] === key && this.inv(key) - qty < 1) return { ok: false, msg: 'Unequip it before selling.' };
    const total = this.sellPrice(key) * qty;
    this.removeItem(key, qty); this.user.money += total; this.save();
    return { ok: true, msg: `Sold ${qty}× ${it.name} for $${total.toLocaleString()}.` };
  },

  // ===== crafting =====
  recipeNeeds(rkey) {
    const r = D.RECIPES[rkey], disc = this.derive().materialDiscount;
    const out = {};
    for (const [m, q] of Object.entries(r.materials)) out[m] = Math.max(1, Math.ceil(q * (1 - disc / 100)));
    return out;
  },
  maxCraftable(rkey) {
    let max = Infinity;
    for (const [m, q] of Object.entries(this.recipeNeeds(rkey))) max = Math.min(max, Math.floor(this.inv(m) / q));
    return max === Infinity ? 0 : max;
  },
  craft(rkey, qty = 1) {
    const r = D.RECIPES[rkey]; if (!r) return { ok: false, msg: 'Unknown recipe.' };
    qty = cleanQty(qty, BAL.MAX_STACK);
    if (this.maxCraftable(rkey) < qty) return { ok: false, msg: 'Not enough materials.' };
    const room = Math.floor(this.room(r.result) / r.qty);
    if (room < qty) return { ok: false, msg: room ? `That would go over the ${BAL.MAX_STACK.toLocaleString()} stack limit — craft at most ${room.toLocaleString()}.` : `Your ${D.ITEMS[r.result] ? D.ITEMS[r.result].name : r.result} stack is full.` };
    for (const [m, q] of Object.entries(this.recipeNeeds(rkey))) this.removeItem(m, q * qty);
    this.addItem(r.result, r.qty * qty);
    this.p.counters.items_crafted += qty;   // (original crafting wiped player stats on save)
    const it = D.ITEMS[r.result];
    if (it && it.cat in this.p.equipped && this.p.settings.auto_equip_everything) this.autoEquipItems([it.cat]);
    this.checkAchievements(); this.save();
    return { ok: true, msg: `Crafted ${r.qty * qty}× ${it ? it.name : r.result}!` };
  },

  // ===== town =====
  innCost() { const p = this.p; return 10 + p.level * 5 + p.area * 10; },
  rest() {
    const d = this.derive(), p = this.p, cost = this.innCost();
    if (p.hp >= d.hpMax && p.mana >= d.manaMax && p.dodge >= p.max_dodge) return { ok: false, msg: 'You are already fully rested.' };
    if (this.user.money < cost) return { ok: false, msg: `The inn costs $${cost}.` };
    this.user.money -= cost; p.hp = d.hpMax; p.mana = d.manaMax; p.dodge = p.max_dodge; this.save();
    return { ok: true, msg: `You rest at the inn (-$${cost}). HP and Mana fully restored.` };
  },
  setArea(n) {
    n = Math.floor(n);
    if (!(n >= 1 && n <= BAL.AREAS)) return { ok: false, msg: `Area must be 1–${BAL.AREAS}.` };
    const need = this.areaMinLevel(n);
    if (this.p.level < need) return { ok: false, msg: `Area ${n} requires level ${need}.` };
    this.p.area = n; this.save();
    return { ok: true, msg: `Moved to Area ${n}.` };
  },
  maxArea() { return clamp(Math.floor((this.p.level - 1) / BAL.LEVELS_PER_AREA) + 1, 1, BAL.AREAS); },
  replenishTreasure() {
    const t = this.treasure;
    if (t.items.length < 10) {
      const pool = [...Object.keys(D.POTIONS).filter(k => !D.MULT_POTION_KEYS.includes(k)), ...Object.keys(D.MAGIC_PACKS), ...Object.keys(D.MATERIALS)];
      const n = randInt(20, 30) - t.items.length;
      for (let i = 0; i < n; i++) t.items.push(choice(pool));
    }
    if (t.money < BAL.TREASURE_MIN) t.money += randInt(50000, 200000);
  },
  searchTreasure() {   // fixed version of explore_dungeon()
    const p = this.p, d = this.derive(), t = this.treasure;
    if (p.hp < d.hpMax * 0.3) return { ok: false, msg: 'You need at least 30% HP to search for treasure.' };
    p.hp = Math.max(1, Math.round(p.hp - d.hpMax * 0.15));
    if (Math.random() < 0.4) { this.save(); return { ok: true, ambush: true, msg: 'While searching, a monster ambushes you!' }; }
    let base = (20 + p.area * 30 + p.level * 5) * (1 + d.treasureBoost / 100);
    let found = Math.min(Math.floor(base * randFloat(0.8, 1.5)), t.money);
    t.money -= found; this.user.money += found;
    p.counters.dungeon_treasure_collected += found; p.counters.total_money_earned += found;
    let item = null;
    if (t.items.length && Math.random() < 0.25) { item = t.items.splice(randInt(0, t.items.length - 1), 1)[0]; this.addItem(item, 1); }
    this.checkAchievements(); this.save();
    return { ok: true, msg: `You found $${found.toLocaleString()} of dungeon treasure` + (item ? ` and a ${D.ITEMS[item] ? D.ITEMS[item].name : item}!` : '!') };
  },

  // ===== combat =====
  scaleMonster(m, area) {
    let s = 1 + (area - 1) * BAL.MON_SCALE;
    if (m.area > area) s *= Math.max(0.35, area / m.area); // weakened early boss
    const ms = 1 + (area - 1) * BAL.MONEY_SCALE, es = 1 + (area - 1) * BAL.EXP_SCALE;
    m.hp = Math.max(1, Math.floor(m.hp * s));
    m.atk_min = Math.max(1, Math.floor(m.atk_min * s));
    m.atk_max = Math.max(m.atk_min, Math.floor(m.atk_max * s));
    m.money_min = Math.floor(m.money_min * ms); m.money_max = Math.max(m.money_min, Math.floor(m.money_max * ms));
    m.exp_min = Math.floor(m.exp_min * es); m.exp_max = Math.max(m.exp_min, Math.floor(m.exp_max * es));
    return m;
  },
  pickMonster(area, boss) {
    let pool;
    if (boss) {
      if (area >= 100 && Math.random() < BAL.SUPER_BOSS_CHANCE) pool = D.MONSTERS.filter(m => m.is_super_boss);
      else {
        const bosses = D.MONSTERS.filter(m => m.is_boss && !m.is_super_boss);
        pool = bosses.filter(m => m.area <= area && m.area > area - 20);
        if (!pool.length) { const below = bosses.filter(m => m.area <= area); pool = below.length ? below.filter(m => m.area === Math.max(...below.map(x => x.area))) : bosses.filter(m => m.area === Math.min(...bosses.map(x => x.area))); }
      }
    } else {
      const normals = D.MONSTERS.filter(m => !m.is_boss);
      pool = normals.filter(m => m.area <= area && m.area > area - 12);
      if (!pool.length) { const below = normals.filter(m => m.area <= area); const top = Math.max(...below.map(x => x.area)); pool = below.filter(m => m.area >= top - 6); }
    }
    const m = deepClone(weightedChoice(pool, x => x.weight || 1));
    if (m.is_super_boss) return m; // super bosses are already absurdly strong
    return this.scaleMonster(m, area);
  },
  startFight(opts = {}) {
    if (this.fight && !this.fight.over) return;
    const p = this.p;
    let m;
    if (this.forcedMonster) { m = deepClone(this.forcedMonster); this.forcedMonster = null; }
    else m = this.pickMonster(p.area, Math.random() < BAL.BOSS_CHANCE);
    m.maxHp = m.hp;
    this.fight = { m, stunned: false, barrier: 0, reflect: false, log: [], over: false, result: null, turn: 0, ambush: !!opts.ambush, fx: [], pending: false, id: Date.now() };
    this.log(m.is_boss ? `🔥 BOSS APPEARS: ${m.name}!` : `A wild ${m.name} appears!`, m.is_boss ? 'boss' : 'info');
    if (opts.ambush) { this.log('You were ambushed!', 'bad'); this.monsterTurn(); if (p.hp <= 0) this.defeat(); }
    this.save();
  },
  log(msg, type = 'info') { if (this.fight) this.fight.log.push({ msg, type }); },
  // visual effects queue consumed by the UI (floating numbers, shakes)
  fx(who, text, kind = 'dmg') { if (this.fight) this.fight.fx.push({ who, text: String(text), kind }); },
  lifesteal(dmg, d) {
    const p = this.p;
    let heal = Math.floor(dmg * d.lifestealFlat / 100);
    if (d.lifestealPct > 0 && Math.random() * 100 < d.lifestealChance) heal += Math.floor(dmg * d.lifestealPct / 100);
    if (heal > 0 && p.hp < d.hpMax) { heal = Math.min(heal, d.hpMax - p.hp); p.hp += heal; this.log(`🩸 Lifesteal! +${heal.toLocaleString()} HP`, 'good'); this.fx('player', `+${heal.toLocaleString()}`, 'heal'); }
  },
  rollCrit(d) { if (Math.random() * 100 < d.crit) { this.p.counters.critical_hits++; return true; } return false; },
  /* Player phase. Returns true if a turn was taken. If the monster still has to
     act, fight.pending becomes true and the UI calls monsterPhase() after a short pause. */
  act(action, arg) {
    const f = this.fight; if (!f || f.over || f.pending) return false;
    const p = this.p, m = f.m, d = this.derive();
    let monsterSkips = false;
    if (action === 'attack') {
      let dmg = randInt(Math.max(1, Math.floor(d.atk * 0.9)), Math.ceil(d.atk * 1.1) + 1);
      const crit = this.rollCrit(d); if (crit) dmg *= 2;
      dmg = Math.max(1, dmg - (m.def || 0));
      m.hp -= dmg;
      this.log(`${crit ? '💥 CRITICAL! ' : ''}You hit ${m.name} for ${dmg.toLocaleString()} damage.`, crit ? 'crit' : 'hit');
      this.fx('monster', crit ? `CRIT ${dmg.toLocaleString()}` : dmg.toLocaleString(), crit ? 'crit' : 'dmg');
      if (Math.random() < BAL.STUN_CHANCE_ATTACK) { f.stunned = true; this.log(`🎯 ${m.name} is stunned!`, 'good'); this.fx('monster', 'STUNNED', 'info'); }
      this.lifesteal(dmg, d);
    } else if (action === 'spell') {
      const key = p.equipped_spells[arg], s = D.SPELLS_BY_KEY[key];
      if (!s) return false;
      if (p.level < s.lvl) { this.log(`${s.name} requires level ${s.lvl}.`, 'bad'); return false; }
      if (p.mana < s.mana) { this.log('Not enough mana!', 'bad'); return false; }
      p.mana -= s.mana;
      const lvlScale = 1 + p.level / 100;
      const roll = () => Math.round((s.power + d.magicAtk) * lvlScale + randInt(-Math.floor(s.power / 8), Math.floor(s.power / 8)));
      if (s.effect === 'heal' || s.effect === 'bigheal') {
        let h = s.effect === 'bigheal' ? Math.floor(d.hpMax * 0.4) + roll() : roll();
        if (this.rollCrit(d)) { h *= 2; this.log('✨ Critical heal!', 'crit'); }
        h = Math.max(0, Math.min(h, d.hpMax - p.hp)); p.hp += h;
        this.log(`You cast ${s.name} and heal ${h.toLocaleString()} HP.`, 'good');
        this.fx('player', `+${h.toLocaleString()}`, 'heal');
      } else if (s.effect === 'reflect') {
        f.reflect = true; this.log(`You cast ${s.name}. The next attack will be reflected!`, 'good'); this.fx('player', 'REFLECT', 'info');
      } else if (s.effect === 'barrier') {
        f.barrier = 3; this.log(`You cast ${s.name}. Damage halved for 3 attacks!`, 'good'); this.fx('player', 'BARRIER', 'info');
      } else {
        let dmg = roll();
        const crit = this.rollCrit(d); if (crit) dmg *= 2;
        dmg = Math.max(1, dmg - (m.magic_def || 0));
        m.hp -= dmg;
        this.log(`${crit ? '✨ CRITICAL! ' : ''}You cast ${s.name} for ${dmg.toLocaleString()} magic damage.`, crit ? 'crit' : 'magic');
        this.fx('monster', crit ? `CRIT ${dmg.toLocaleString()}` : dmg.toLocaleString(), crit ? 'crit' : 'magic');
        if (s.type === 'lightning' || s.type === 'ice') {
          const chance = m.element === s.type ? 0.1 : BAL.STUN_CHANCE_SPELL;
          if (Math.random() < chance) { f.stunned = true; this.log(`${s.type === 'ice' ? '🧊' : '⚡'} ${m.name} is stunned!`, 'good'); this.fx('monster', s.type === 'ice' ? 'FROZEN' : 'STUNNED', 'info'); }
        }
        if (s.effect === 'drain') { const h = Math.min(Math.floor(dmg / 2), d.hpMax - p.hp); if (h > 0) { p.hp += h; this.log(`You drain ${h.toLocaleString()} HP.`, 'good'); this.fx('player', `+${h.toLocaleString()}`, 'heal'); } }
        this.lifesteal(dmg, d);
      }
    } else if (action === 'dodge') {
      if (p.dodge <= 0) { this.log('No dodges remaining!', 'bad'); return false; }
      p.dodge--; monsterSkips = true;
      this.log(`You dodge the attack! (${p.dodge} dodges left)`, 'good');
      this.fx('player', 'DODGE', 'info');
    } else if (action === 'item') {
      const hp0 = p.hp, mp0 = p.mana;
      const r = this.useConsumable(arg, 1);
      if (!r.ok) { this.log(r.msg, 'bad'); return false; }
      this.log(r.msg, 'good');
      if (p.hp > hp0) this.fx('player', `+${(p.hp - hp0).toLocaleString()}`, 'heal');
      else if (p.mana > mp0) this.fx('player', `+${(p.mana - mp0).toLocaleString()} MP`, 'mana');
      else this.fx('player', 'BUFF', 'info');
    } else if (action === 'run') {
      if (Math.random() < (m.is_super_boss ? 0.25 : BAL.RUN_CHANCE)) {
        this.log('You ran away successfully!', 'info');
        f.over = true; this.tickBuffs(); f.result = { type: 'fled', recovered: this.recover() }; this.save(); return true;
      }
      this.log('Failed to run!', 'bad'); this.fx('player', 'FAILED', 'info');
    } else return false;
    f.turn++; f.lastAction = action;
    if (m.hp <= 0) { this.victory(); return true; }
    if (monsterSkips) this.endTurn(action); else f.pending = true;
    this.save();
    return true;
  },
  /* Monster phase (called by the UI after a pause, or directly by tests). */
  monsterPhase() {
    const f = this.fight; if (!f || f.over || !f.pending) return;
    f.pending = false;
    this.monsterTurn();
    if (f.m.hp <= 0) return this.victory();
    if (this.p.hp <= 0) return this.defeat();
    this.endTurn(f.lastAction);
    this.save();
  },
  endTurn(action) {
    const p = this.p, d = this.derive();
    if (d.manaRegen > 0 && p.mana < d.manaMax) p.mana = Math.min(d.manaMax, p.mana + d.manaRegen);
    if (d.hpRegen > 0 && p.hp < d.hpMax) { const h = Math.min(d.hpRegen, d.hpMax - p.hp); p.hp += h; this.log(`Regen +${h} HP`, 'good'); this.fx('player', `+${h}`, 'heal'); }
    if (action !== 'dodge' && p.dodge < p.max_dodge) {
      p.dodge_progress++;
      if (p.dodge_progress >= BAL.DODGE_REGEN_TURNS) { p.dodge_progress = 0; p.dodge++; this.log(`Dodge regenerated (${p.dodge}/${p.max_dodge})`, 'info'); }
    }
  },
  monsterTurn() {
    const f = this.fight, m = f.m, p = this.p, d = this.derive();
    if (f.stunned) { f.stunned = false; this.log(`${m.name} is stunned and cannot attack!`, 'info'); this.fx('monster', '💫 stunned', 'info'); return; }
    if (Math.random() < 0.05) { this.log(`${m.name} hesitates and does not attack!`, 'info'); this.fx('monster', 'hesitates…', 'info'); return; }
    const raw = randInt(m.atk_min, m.atk_max);
    const magic = m.element === 'mana' && Math.random() < BAL.MAGIC_ATTACK_CHANCE;
    let dmg = Math.max(1, raw - (magic ? d.magicDef : d.def));  // (original ignored armor entirely here)
    if (f.reflect) { f.reflect = false; m.hp -= dmg; this.log(`🔁 You reflect ${m.name}'s attack for ${dmg.toLocaleString()} damage!`, 'good'); this.fx('monster', dmg.toLocaleString(), 'crit'); return; }
    if (f.barrier > 0) { f.barrier--; dmg = Math.max(1, Math.floor(dmg / 2)); }
    p.hp -= dmg;
    this.log(`${m.name} ${magic ? 'casts a spell' : 'attacks'}! You take ${dmg.toLocaleString()} damage.`, 'dmg');
    this.fx('player', `-${dmg.toLocaleString()}`, magic ? 'enemymagic' : 'enemy');
  },
  /* Very rare drops, unlocked progressively by area: the Perm EXP Gain Upgrade
     (every area) and EXP potions (each tier from its own starting area). */
  rollRareDrops(m, area, addDrop) {
    if (Math.random() < D.expGainDropChance(area, m.is_boss)) addDrop('perm_exp_gain_upgrade');
    const boost = m.is_super_boss ? 20 : m.is_boss ? 5 : 1;
    const tiers = D.MULT_TIERS.filter(t => area >= t.area).reverse();   // try the strongest first
    for (const K of Object.values(D.MULT_KINDS)) {                      // EXP and Coin potions roll separately
      for (const t of tiers) {
        const depth = 1 + (area - t.area) / 50;   // deeper areas -> slightly better odds
        if (Math.random() < t.chance * boost * depth) {
          const dur = weightedChoice(D.MULT_DURATIONS, x => ({ 5: 60, 10: 25, 15: 10, 20: 5 })[x]);
          addDrop(`${K.prefix}_x${t.mult}_${dur}`);
          break;
        }
      }
    }
  },
  /* One battle passes. Normal buffs all tick. For EXP/Coin multipliers only the strongest
     active one ticks — weaker ones wait in the queue, so stacking potions never wastes them. */
  /* After-battle recovery: base % + armor + titles, of max HP and max Mana. */
  recover() {
    const p = this.p, d = this.derive();
    const hp = Math.max(0, Math.min(Math.floor(d.hpMax * d.recovery / 100), d.hpMax - p.hp));
    const mana = Math.max(0, Math.min(Math.floor(d.manaMax * d.recovery / 100), d.manaMax - p.mana));
    p.hp += hp; p.mana += mana;
    if (hp || mana) this.log(`🌿 Recovered ${hp.toLocaleString()} HP and ${mana.toLocaleString()} Mana (${d.recovery}%).`, 'good');
    return { hp, mana, pct: d.recovery };
  },
  tickBuffs() {
    const p = this.p;
    const active = new Set();
    for (const type of D.MULT_BUFFS) {
      const best = p.buffs.filter(b => b.type === type).sort((a, b) => b.amount - a.amount)[0];
      if (best) active.add(best);
    }
    for (const b of p.buffs) if (!D.MULT_BUFFS.includes(b.type) || active.has(b)) b.remaining -= 1;
    p.buffs = p.buffs.filter(b => b.remaining > 0);
    this.clampVitals();
  },
  multQueue(type, p = this.p) { return p.buffs.filter(b => b.type === type).sort((a, b) => b.amount - a.amount); },
  victory() {
    const f = this.fight, m = f.m, p = this.p, u = this.user, d = this.derive();
    f.over = true;
    let money = Math.floor(randInt(m.money_min, m.money_max) * (1 + d.moneyBoost / 100) * d.coinMult);
    const drops = {};
    const addDrop = (k, n = 1) => { this.addItem(k, n); drops[k] = (drops[k] || 0) + n; if (D.MATERIALS[k]) p.counters.materials_collected += n; };
    for (const [k, ch] of Object.entries(m.drop || {})) {   // (original rolled the drop table twice)
      if (Math.random() <= ch) addDrop(k);
      else if (D.MATERIALS[k] && d.materialBoost && Math.random() * 100 < d.materialBoost) addDrop(k);
    }
    this.rollRareDrops(m, p.area, addDrop);
    let score, treasure = 0;
    if (m.is_boss) {
      for (const k of Object.keys(D.PERM_UPGRADES)) if (!D.BOSS_EXCLUDED_UPGRADES.includes(k)) addDrop(k);  // (original granted these twice)
      const pool = [...Object.keys(D.MATERIALS), ...Object.keys(D.POTIONS).filter(k => !D.MULT_POTION_KEYS.includes(k)), ...Object.keys(D.MAGIC_PACKS)];
      for (const k of sample(pool, randInt(2, 7))) addDrop(k);
      score = Math.floor(m.maxHp / 10) * randInt(10, 50);
      const t = this.treasure;
      if (t.money > 0) {
        treasure = Math.min(t.money, Math.floor(t.money * 0.1 * (1 + d.treasureBoost / 100)));
        t.money -= treasure; p.counters.dungeon_treasure_collected += treasure;
      }
      p.counters.bosses_defeated++;
    } else score = Math.floor(m.maxHp / 5) * randInt(1, 10);
    u.money += money + treasure; u.score += score;
    p.counters.monsters_defeated++;
    p.counters.total_money_earned += money + treasure;
    const exp = this.grantExp(randInt(m.exp_min, m.exp_max));
    this.tickBuffs();
    if (p.settings.auto_equip_everything) this.autoEquipItems();
    this.checkAchievements();
    f.result = { type: 'win', money, treasure, score, exp: exp.gained, levels: exp.levels, drops, recovered: this.recover() };
    this.log(`🎉 You defeated ${m.name}!`, 'win');
    this.save();
  },
  defeat() {
    const f = this.fight, p = this.p, u = this.user, d = this.derive();
    f.over = true;
    const lost = Math.floor(u.money * BAL.DEATH_MONEY_LOSS * (1 + d.deathPenalty / 100));
    u.money -= lost; this.treasure.money += lost;
    const equippedKeys = new Set(Object.values(p.equipped).filter(Boolean));
    const losable = Object.keys(p.inventory).filter(k => !D.PERM_UPGRADES[k] && !equippedKeys.has(k));
    const lostItems = sample(losable, losable.length ? randInt(1, Math.min(5, losable.length)) : 0);
    for (const k of lostItems) this.removeItem(k, 1);
    p.counters.times_died++;
    p.buffs = p.buffs.filter(b => D.MULT_BUFFS.includes(b.type));   // EXP/Coin potions survive death but the battle still counts
    this.tickBuffs();
    const nd = this.derive(); p.hp = nd.hpMax; p.mana = nd.manaMax; p.dodge = p.max_dodge;
    this.replenishTreasure();
    this.checkAchievements();
    f.result = { type: 'lose', lostMoney: lost, lostItems };
    this.log('☠️ You have been defeated!', 'lose');
    this.save();
  },
  endFight() { this.fight = null; this.save(); },

  // ===== avatar & profile =====
  setAvatar(cfg) { this.user.avatar = Object.assign(defaultAvatar(), cfg); this.save(); },
  setProfile(fields) {
    const pr = this.user.profile;
    if ('bio' in fields) pr.bio = String(fields.bio || '').slice(0, 240);
    if ('banner' in fields) pr.banner = fields.banner;
    this.save();
  },
  toggleShowcase(key) {
    const sc = this.user.profile.showcase;
    const i = sc.indexOf(key);
    if (i >= 0) { sc.splice(i, 1); this.save(); return { ok: true, msg: 'Removed from profile showcase.' }; }
    if (sc.length >= 6) return { ok: false, msg: 'Showcase is full (6). Remove one first.' };
    if (!this.inv(key)) return { ok: false, msg: "You don't own that." };
    sc.push(key); this.save();
    return { ok: true, msg: `Pinned ${D.ITEMS[key] ? D.ITEMS[key].name : key} to your profile.` };
  },
  profileOf(name) {
    const u = Store.data.users[(name || '').toLowerCase()]; if (!u) return null;
    const p = u.player, d = this.derive(p);
    const owned = Object.keys(p.inventory).map(k => D.ITEMS[k]).filter(Boolean);
    const best = owned.filter(it => it.cat !== 'material').sort((a, b) => D.RARITY_RANK[b.rarity] - D.RARITY_RANK[a.rarity] || b.power - a.power).slice(0, 6);
    const showcase = u.profile.showcase.filter(k => p.inventory[k] && D.ITEMS[k]).map(k => D.ITEMS[k]);
    const ranks = {};
    for (const t of Object.keys(this.LB_TYPES)) ranks[t] = this.leaderboard(t, 9999).findIndex(r => r.name === u.username) + 1;
    return { u, p, d, best, showcase, power: this.power(p), ranks, title: this.displayTitle(p) };
  },
  otherPlayers() { return Object.keys(Store.data.users).filter(n => !this.user || n !== this.user.username).sort(); },

  // ===== notifications =====
  notifyUser(username, text, kind = 'info', extra = {}) {
    const n = Store.data.notifications;
    (n[username] = n[username] || []).unshift(Object.assign({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), text, kind, time: Date.now(), read: false }, extra));
    if (n[username].length > 100) n[username].length = 100;
  },
  myNotifications() { return this.user ? (Store.data.notifications[this.user.username] || []) : []; },
  unreadCount() { return this.myNotifications().filter(n => !n.read).length; },
  markAllRead() { this.myNotifications().forEach(n => n.read = true); this.save(); },
  clearNotifications() { if (this.user) Store.data.notifications[this.user.username] = []; this.save(); },

  // ===== trading =====
  // Anything in the inventory can be traded except the copy you have equipped.
  tradable(user, key) {
    const p = user.player, n = p.inventory[key] || 0;
    const it = D.ITEMS[key];
    return Math.max(0, n - (it && p.equipped[it.cat] === key ? 1 : 0));
  },
  tradableList(user) { return Object.keys(user.player.inventory).filter(k => D.ITEMS[k] && this.tradable(user, k) > 0).map(k => D.ITEMS[k]); },
  cleanBundle(b) {
    const items = {};
    for (const [k, q] of Object.entries(b.items || {})) { const n = Math.min(Math.floor(Number(q)), BAL.MAX_STACK); if (D.ITEMS[k] && n > 0) items[k] = n; }
    return { items, money: Math.max(0, Math.floor(Number(b.money) || 0)) };
  },
  bundleProblem(user, b, who) {
    if (user.money < b.money) return `${who} no longer has $${b.money.toLocaleString()}.`;
    for (const [k, q] of Object.entries(b.items)) if (this.tradable(user, k) < q) {
      const eq = user.player.equipped[D.ITEMS[k].cat] === k;
      return `${who} no longer has ${q}× ${D.ITEMS[k].name} available${eq ? " (the equipped copy can't be traded)" : ''}.`;
    }
    return null;
  },
  bundleText(b) {
    const parts = Object.entries(b.items).map(([k, q]) => `${q}× ${D.ITEMS[k] ? D.ITEMS[k].name : k}`);
    if (b.money) parts.push(`$${b.money.toLocaleString()}`);
    return parts.join(', ') || 'nothing';
  },
  createTrade(toName, give, want, note = '') {
    const me = this.user, to = Store.data.users[(toName || '').toLowerCase()];
    if (!to) return { ok: false, msg: 'Player not found.' };
    if (to === me) return { ok: false, msg: "You can't trade with yourself." };
    give = this.cleanBundle(give); want = this.cleanBundle(want);
    if (!Object.keys(give.items).length && !give.money && !Object.keys(want.items).length && !want.money) return { ok: false, msg: 'The trade is empty.' };
    const prob = this.bundleProblem(me, give, 'You');
    if (prob) return { ok: false, msg: prob.replace('no longer has', "don't have") };
    const theirs = this.bundleProblem(to, want, to.username);
    if (theirs) return { ok: false, msg: theirs.replace('no longer has', "doesn't have") };
    const id = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    Store.data.trades[id] = { id, from: me.username, to: to.username, give, want, note: String(note).slice(0, 140), status: 'pending', created: Date.now(), updated: Date.now() };
    this.notifyUser(to.username, `📦 ${me.username} sent you a trade offer: they give ${this.bundleText(give)} for ${this.bundleText(want)}.`, 'trade', { tradeId: id });
    this.save();
    return { ok: true, msg: `Trade offer sent to ${to.username}.`, id };
  },
  tradesFor(name = this.user.username) {
    return Object.values(Store.data.trades).filter(t => t.from === name || t.to === name).sort((a, b) => b.updated - a.updated);
  },
  respondTrade(id, accept) {
    const t = Store.data.trades[id], me = this.user;
    if (!t || t.status !== 'pending') return { ok: false, msg: 'This trade is no longer pending.' };
    if (t.to !== me.username) return { ok: false, msg: 'Only the receiver can respond.' };
    const from = Store.data.users[t.from];
    if (!accept || !from) {
      t.status = from ? 'declined' : 'failed'; t.updated = Date.now();
      if (from) this.notifyUser(from.username, `❌ ${me.username} declined your trade (${this.bundleText(t.give)} for ${this.bundleText(t.want)}).`, 'trade', { tradeId: id });
      this.save();
      return { ok: true, msg: from ? 'Trade declined.' : 'The other player no longer exists.' };
    }
    // validate BOTH sides right now — prevents duplication if items were used/sold/traded meanwhile
    const full = (user, b) => Object.entries(b.items).find(([k, q]) => (user.player.inventory[k] || 0) + q > BAL.MAX_STACK);
    const fullMe = full(me, t.give), fullThem = full(from, t.want);
    const prob = this.bundleProblem(from, t.give, from.username) || this.bundleProblem(me, t.want, 'You')
      || (fullMe && `You can't hold more than ${BAL.MAX_STACK.toLocaleString()} ${D.ITEMS[fullMe[0]].name}.`)
      || (fullThem && `${from.username} can't hold more than ${BAL.MAX_STACK.toLocaleString()} ${D.ITEMS[fullThem[0]].name}.`);
    if (prob) {
      t.status = 'failed'; t.reason = prob; t.updated = Date.now();
      this.notifyUser(from.username, `⚠️ Your trade with ${me.username} failed: ${prob}`, 'trade', { tradeId: id });
      this.save();
      return { ok: false, msg: `Trade failed: ${prob}` };
    }
    const move = (src, dst, b) => {
      src.money -= b.money; dst.money += b.money;
      for (const [k, q] of Object.entries(b.items)) {
        src.player.inventory[k] -= q; if (src.player.inventory[k] <= 0) delete src.player.inventory[k];
        dst.player.inventory[k] = (dst.player.inventory[k] || 0) + q;
      }
    };
    move(from, me, t.give);
    move(me, from, t.want);
    for (const u of [from, me]) u.profile.showcase = u.profile.showcase.filter(k => u.player.inventory[k]);
    t.status = 'accepted'; t.updated = Date.now();
    this.notifyUser(from.username, `✅ ${me.username} accepted your trade! You received ${this.bundleText(t.want)}.`, 'trade', { tradeId: id });
    this.save();
    return { ok: true, msg: `Trade complete! You received ${this.bundleText(t.give)}.` };
  },
  cancelTrade(id) {
    const t = Store.data.trades[id];
    if (!t || t.status !== 'pending' || t.from !== this.user.username) return { ok: false, msg: 'Cannot cancel this trade.' };
    t.status = 'cancelled'; t.updated = Date.now();
    this.notifyUser(t.to, `🚫 ${t.from} cancelled their trade offer.`, 'trade', { tradeId: id });
    this.save();
    return { ok: true, msg: 'Trade cancelled.' };
  },
  pendingIncoming() { return this.user ? Object.values(Store.data.trades).filter(t => t.status === 'pending' && t.to === this.user.username).length : 0; },

  // ===== mini game =====
  guess: null,
  newGuess() { this.guess = { number: randInt(1, 100), attempts: 0, done: false, history: [] }; },
  makeGuess(n) {
    const g = this.guess; if (!g || g.done) return null;
    g.attempts++;
    let res;
    if (n < g.number) res = 'Too low!'; else if (n > g.number) res = 'Too high!';
    else { const pts = Math.max(0, 10 - g.attempts); this.user.score += pts; g.done = true; this.save(); res = `Correct in ${g.attempts} attempts! +${pts} score`; }
    g.history.unshift(`${n} → ${res}`);
    return res;
  },

  // ===== save import/export =====
  exportSave() { return JSON.stringify(Store.data, null, 2); },
  importSave(text) {
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== 'object' || !obj.users) throw new Error('Not a Dunes Intred save file.');
    localStorage.setItem(SAVE_KEY, JSON.stringify(obj));
    Store.load(); this.user = null; this.fight = null;
  },
};

