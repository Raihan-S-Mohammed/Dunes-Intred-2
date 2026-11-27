"use strict";
/* Post-processing of the raw tables in data.js + the data that couldn't be
   auto-extracted (achievements use lambdas in Python). Also fixes several
   data bugs from fullcode.py:
   - craftable items were merged into WEAPONS/ARMORS/... and then the dicts were
     redefined, wiping the crafted items' stats. Now merged properly.
   - monsters drop 'void_core' / 'titan_core' that did not exist as materials.
   - spells with power 0 (Mirror Shield, Holy Barrier, Resurgence) did nothing.
*/

// ---------- Balance knobs (tweak freely) ----------
const BAL = {
  MAX_LEVEL: 7500,
  AREAS: 100,
  LEVELS_PER_AREA: 2,          // area N needs level (N-1)*2+1  (original 75/area made area 2 unreachable)
  BOSS_CHANCE: 0.05,
  SUPER_BOSS_CHANCE: 0.02,     // inside the boss roll, only in area 100
  MON_SCALE: 0.05,             // monster hp/atk growth per area
  MONEY_SCALE: 0.2,
  EXP_SCALE: 0.25,
  DEATH_MONEY_LOSS: 0.25,
  RUN_CHANCE: 0.5,
  STUN_CHANCE_ATTACK: 0.05,
  STUN_CHANCE_SPELL: 0.35,     // lightning / ice spells (original 95% = permanent stun)
  MAGIC_ATTACK_CHANCE: 0.35,   // 'mana' element monsters sometimes cast magic (robes matter)
  DODGE_REGEN_TURNS: 2,
  TREASURE_MIN: 200000,
  TREASURE_MAX: 1000000,
  // ---- safety limits (stop huge numbers from freezing the game, even via debug commands) ----
  BASE_RECOVERY: 5,            // % of max HP & Mana recovered after every battle won or fled (armor/titles add more)
  MAX_RECOVERY: 100,
  MAX_STACK: 1000000,          // max quantity of any single item in an inventory
  USE_LIMIT: 1000,             // max potions/buffs used or packs opened per click ("Use all" included)
  UPGRADE_USE_LIMIT: 100000,   // max permanent upgrades applied per click
  MAX_MULT_BATTLES: 100000,    // max battles stored for one EXP/Coin multiplier
};

(function () {
  const D = DATA;

  // keys that the shop sells (base items, before merging craftables)
  D.SHOP_KEYS = {
    weapon: Object.keys(D.WEAPONS), armor: Object.keys(D.ARMORS), wand: Object.keys(D.WANDS),
    robe: Object.keys(D.ROBES), necklace: Object.keys(D.NECKLACES),
  };

  const catTable = { weapon: 'WEAPONS', armor: 'ARMORS', wand: 'WANDS', robe: 'ROBES', necklace: 'NECKLACES' };
  D.CRAFTED_KEYS = new Set();
  for (const t of ['CRAFTABLE_WEAPONS', 'CRAFTABLE_ARMORS', 'CRAFTABLE_WANDS', 'CRAFTABLE_ROBES', 'CRAFTABLE_NECKLACES']) {
    for (const [k, v] of Object.entries(D[t])) {
      const it = Object.assign({}, v);
      const cat = it.type;
      delete it.recipe; delete it.type;
      if ('magic_power' in it) { it.magic_atk = it.magic_power; delete it.magic_power; }
      D[catTable[cat]][k] = Object.assign({}, D[catTable[cat]][k] || {}, it);
      D.RECIPES[k] = { materials: v.recipe, result: k, qty: 1 };
      D.CRAFTED_KEYS.add(k);
    }
  }

  // Grim Reaper had exp 9,615,670–10,926,721 (typo: every other area-100 boss follows a ×1.5 curve)
  const reaper = D.MONSTERS.find(m => m.name === 'Grim Reaper');
  if (reaper) { reaper.exp_min = 9610; reaper.exp_max = 19220; }

  D.MATERIALS.void_core = { name: 'Void Core', rarity: 'mythical', desc: 'A pulsing core torn from the void.' };
  D.MATERIALS.titan_core = { name: 'Titan Core', rarity: 'mythical', desc: 'The heart-stone of an eternal titan.' };

  // spell fixes / special effects
  const S = D.SPELLS_BY_KEY;
  S.earth_quake.name = 'Earth Quake';
  S.purge.type = 'holy';
  S.mirror_shield.effect = 'reflect';  S.mirror_shield.desc = 'Reflects the next enemy attack back at it.';
  S.holy_barrier.effect = 'barrier';   S.holy_barrier.desc = 'Halves damage taken for the next 3 enemy attacks.';
  S.resurgence.effect = 'bigheal';     S.resurgence.desc = 'Heals 40% of max HP plus spell power.';
  S.life_drain.effect = 'drain';       S.life_drain.desc = 'Damages the enemy and heals you for half of it.';
  for (const s of Object.values(S)) if (!s.effect) s.effect = s.type === 'heal' ? 'heal' : 'damage';

  // prices used by shop and selling
  D.CONSUMABLE_PRICES = {
    potion: 20, strong_potion: 80, ultra_potion: 350, mana_regen_potion: 120, instant_mana: 60,
    strength_boost: 60, defense_boost: 60, regen_potion: 80, crit_boost: 80, mana_upgrade_potion: 100,
  };
  D.SHOP_CONSUMABLES = ['potion', 'strong_potion', 'ultra_potion', 'mana_regen_potion', 'instant_mana',
    'strength_boost', 'defense_boost', 'regen_potion', 'crit_boost'];
  D.PACK_PRICES = { common_magic_pack: 150, rare_magic_pack: 750 };   // only these two are sold
  D.PACK_SELL = { common_magic_pack: 40, rare_magic_pack: 200, mythical_magic_pack: 600, prismatic_magic_pack: 1800, divine_magic_pack: 6000, transcendent_magic_pack: 18000 };
  D.PACK_DUP_REFUND = { common_magic_pack: 5, rare_magic_pack: 20, mythical_magic_pack: 60, prismatic_magic_pack: 200, divine_magic_pack: 600, transcendent_magic_pack: 2000 };
  D.MATERIAL_SELL = { common: 5, rare: 40, mythical: 150 };

  D.POTION_TEXT = {
    potion: 'Restores 30 HP.', strong_potion: 'Restores 80 HP.', ultra_potion: 'Restores 200 HP.',
    mana_upgrade_potion: 'Restores 50 Mana.', instant_mana: 'Fully restores Mana.',
    strength_boost: '+5 ATK for 4 fights.', defense_boost: '+3 DEF for 4 fights.',
    regen_potion: '+12 HP every turn for 4 fights.', crit_boost: '+50% crit chance for 4 fights.',
    mana_regen_potion: '+15 Mana every turn for 4 fights.',
  };

  // ---------- Multiplier potions: EXP and Coin, 7 multipliers × 4 durations ----------
  // From ×4 upward every tier is ~4–5× rarer to find and needs a lot more material to craft.
  // tier: multiplier, rarity, first area it can drop in, base drop chance, recipe scale, base recipe
  D.MULT_TIERS = [
    // chain: from ×8 up each recipe also needs `chain` potions of the tier below (same duration) — costs compound
    { mult: 2,    rarity: 'rare',         area: 1,  chance: 0.004,       scale: 1,   chain: 0,  recipe: { troll_core: 3, dark_essence: 3, crystal_shard: 6, spider_venom: 4 } },
    { mult: 4,    rarity: 'mythical',     area: 10, chance: 0.0012,      scale: 1,   chain: 0,  recipe: { frozen_heart: 3, fire_essence: 3, crystal_shard: 8, arcane_tome: 2 } },
    { mult: 8,    rarity: 'mythical',     area: 25, chance: 0.00015,     scale: 3,   chain: 3,  recipe: { phoenix_feather: 3, thunder_core: 3, holy_light: 3, prism_fragment: 3 } },
    { mult: 16,   rarity: 'prismatic',    area: 40, chance: 0.00002,     scale: 6,   chain: 4,  recipe: { dragon_scale: 4, star_dust: 4, moon_rock: 4, sun_stone: 4 } },
    { mult: 64,   rarity: 'divine',       area: 60, chance: 0.000002,    scale: 12,  chain: 5,  recipe: { void_fragment: 6, soul_shard: 4, demon_horn: 4, infinitium_piece: 2 } },
    { mult: 1024, rarity: 'transcendent', area: 80, chance: 0.0000002,   scale: 25,  chain: 8,  recipe: { transcendent_heart: 2, infinitium_piece: 5, void_core: 3, soul_shard: 8 } },
    { mult: 5012, rarity: 'transcendent', area: 95, chance: 0.00000002,  scale: 50,  chain: 10, recipe: { transcendent_heart: 5, titan_core: 5, void_core: 5, infinitium_piece: 10, star_dust: 20 } },
  ];
  D.EXP_POTION_TIERS = D.MULT_TIERS;   // (kept for older code paths)
  D.MULT_DURATIONS = [5, 10, 15, 20];  // battles
  D.EXP_POTION_DURATIONS = D.MULT_DURATIONS;
  // kinds of multiplier potion. Coin potions need gold-flavoured extras on top of the same tier materials.
  D.MULT_KINDS = {
    exp:  { prefix: 'exp_potion',  name: 'EXP Potion',  buff: 'exp_mult',  icon: '📈', what: 'EXP from monsters', extra: {} },
    coin: { prefix: 'coin_potion', name: 'Coin Potion', buff: 'coin_mult', icon: '💰', what: 'money from monsters', extra: { orc_iron: 4, sun_stone: 1 } },
  };
  D.MULT_BUFFS = ['exp_mult', 'coin_mult'];
  D.EXP_POTION_KEYS = []; D.COIN_POTION_KEYS = []; D.MULT_POTION_KEYS = [];
  for (const [kind, K] of Object.entries(D.MULT_KINDS)) {
    for (const [ti, t] of D.MULT_TIERS.entries()) {
      for (const [di, dur] of D.MULT_DURATIONS.entries()) {
        const key = `${K.prefix}_x${t.mult}_${dur}`;
        D.POTIONS[key] = { name: `${K.name} ×${t.mult} (${dur} battles)`, effect: 'buff_' + K.buff, amount: t.mult, duration: dur, rarity: t.rarity, multKind: kind };
        D.POTION_TEXT[key] = `×${t.mult.toLocaleString()} ${K.what} for ${dur} battles. Using more adds battles; weaker multipliers wait until stronger ones run out.`;
        D.CONSUMABLE_PRICES[key] = Math.round(t.mult * 400 * (di + 1));   // used for selling (half)
        const qty = (base) => base * t.scale * (di + 1);
        const mats = {};
        for (const [m, q] of Object.entries(t.recipe)) mats[m] = qty(q);
        for (const [m, q] of Object.entries(K.extra)) mats[m] = (mats[m] || 0) + qty(q);
        if (t.chain) mats[`${K.prefix}_x${D.MULT_TIERS[ti - 1].mult}_${dur}`] = t.chain;
        D.RECIPES[key] = { materials: mats, result: key, qty: 1 };
        (kind === 'exp' ? D.EXP_POTION_KEYS : D.COIN_POTION_KEYS).push(key);
        D.MULT_POTION_KEYS.push(key);
      }
    }
  }

  // ---------- Perm EXP Gain Upgrade (new, rare, every area) ----------
  // Separate multiplier on top of the old +10% Perm Exp Upgrade.
  D.PERM_UPGRADES.perm_exp_gain_upgrade = { name: 'Perm EXP Gain Upgrade', exp_gain_increase: 50 };
  D.RECIPES.perm_exp_gain_upgrade = { materials: { moon_rock: 8, sun_stone: 8, star_dust: 6, soul_shard: 3, crystal_shard: 10 }, result: 'perm_exp_gain_upgrade', qty: 1 };
  D.BOSS_EXCLUDED_UPGRADES = ['perm_exp_gain_upgrade'];   // bosses don't hand this one out automatically
  // drop chance grows with area: normal 0.17% (area 1) → 2.1% (area 100); bosses 4.2% → 24%
  D.expGainDropChance = (area, boss) => boss ? 0.04 + area * 0.002 : 0.0015 + area * 0.0002;

  // ---------- Achievements (conditions ported from the Python lambdas) ----------
  const c = (p, k) => (p.counters[k] || 0);
  D.ACHIEVEMENTS = {
    first_monster:   { name: 'First Blood', title: 'Slayer', desc: 'Defeat 1 monster', cond: p => c(p, 'monsters_defeated') >= 1, prog: p => [c(p, 'monsters_defeated'), 1] },
    hundred_monsters:{ name: 'Monster Hunter', title: 'Hunter', desc: 'Defeat 100 monsters', cond: p => c(p, 'monsters_defeated') >= 100, prog: p => [c(p, 'monsters_defeated'), 100] },
    thousand_monsters:{ name: 'Monster Slayer', title: 'Slayer II', desc: 'Defeat 1000 monsters', cond: p => c(p, 'monsters_defeated') >= 1000, prog: p => [c(p, 'monsters_defeated'), 1000] },
    boss_defeats_10: { name: 'Boss Hunter', title: 'Boss Slayer', desc: 'Defeat 10 bosses', cond: p => c(p, 'bosses_defeated') >= 10, prog: p => [c(p, 'bosses_defeated'), 10] },
    boss_defeats_50: { name: 'Boss Master', title: 'Boss Master', desc: 'Defeat 50 bosses', cond: p => c(p, 'bosses_defeated') >= 50, prog: p => [c(p, 'bosses_defeated'), 50] },
    millionaire:     { name: 'Wealthy', title: 'Millionaire', desc: 'Earn 1,000,000 total money', cond: p => c(p, 'total_money_earned') >= 1e6, prog: p => [c(p, 'total_money_earned'), 1e6] },
    spell_master:    { name: 'Spellcaster', title: 'Arcane Master', desc: 'Learn 10 spells', cond: p => p.learned_spells.length >= 10, prog: p => [p.learned_spells.length, 10] },
    crafting_expert: { name: 'Craftsman', title: 'Artisan', desc: 'Craft 50 items', cond: p => c(p, 'items_crafted') >= 50, prog: p => [c(p, 'items_crafted'), 50] },
    collector:       { name: 'Collector', title: 'Collector', desc: 'Collect 500 materials', cond: p => c(p, 'materials_collected') >= 500, prog: p => [c(p, 'materials_collected'), 500] },
    survivor:        { name: 'Survivor', title: 'Immortal', desc: 'Die 100 times', cond: p => c(p, 'times_died') >= 100, prog: p => [c(p, 'times_died'), 100] },
    perfectionist:   { name: 'Perfect Game', title: 'Perfect', desc: 'Defeat 1000 monsters, 10 bosses, learn 5 spells, reach level 50',
      cond: p => c(p, 'monsters_defeated') >= 1000 && c(p, 'bosses_defeated') >= 10 && p.learned_spells.length >= 5 && p.level >= 50 },
    legendary:       { name: 'Legendary Adventurer', title: 'Legendary', desc: 'Defeat 5000 monsters, 100 bosses, reach level 80',
      cond: p => c(p, 'monsters_defeated') >= 5000 && c(p, 'bosses_defeated') >= 100 && p.level >= 80 },
    godlike:         { name: 'God Among Men', title: 'Deity', desc: 'Defeat 10000 monsters, 200 bosses, reach level 100',
      cond: p => c(p, 'monsters_defeated') >= 10000 && c(p, 'bosses_defeated') >= 200 && p.level >= 100 },
    treasure_hunter: { name: 'Treasure Hunter', title: 'Treasure King', desc: 'Collect 500,000 from dungeon treasure', cond: p => c(p, 'dungeon_treasure_collected') >= 5e5, prog: p => [c(p, 'dungeon_treasure_collected'), 5e5] },
    lucky:           { name: 'Lucky', title: "Fortune's Favorite", desc: 'Land 1000 critical hits', cond: p => c(p, 'critical_hits') >= 1000, prog: p => [c(p, 'critical_hits'), 1000] },
  };

  D.LEVEL_TITLES = [[10, 'novice'], [20, 'apprentice'], [30, 'warrior'], [40, 'champion'], [50, 'legend'],
    [60, 'master'], [70, 'grandmaster'], [80, 'mytic'], [99, 'transcendent'], [Infinity, 'godlike']];
  D.titleKeyByName = name => Object.keys(D.TITLES).find(k => D.TITLES[k].name === name) || null;
  // How to unlock each title (for locked titles UI)
  D.TITLE_UNLOCK = {};
  let prev = 0;
  for (const [lvl, key] of D.LEVEL_TITLES) { D.TITLE_UNLOCK[key] = lvl === Infinity ? 'Reach level 100' : (prev === 0 ? 'Starting title' : `Reach level ${prev + 1}`); prev = lvl; }
  for (const a of Object.values(D.ACHIEVEMENTS)) { const k = D.titleKeyByName(a.title); if (k) D.TITLE_UNLOCK[k] = `Achievement: ${a.name}`; }

  // ---------- Unified item registry ----------
  const RANK = ['common', 'rare', 'mythical', 'prismatic', 'divine', 'transcendent'];
  D.RARITY_RANK = Object.fromEntries(RANK.map((r, i) => [r, i]));
  function equipRarity(it) {
    const s = it.score_price || 0, pr = it.price || 0;
    if (s >= 9500) return 'transcendent';
    if (s >= 2400) return 'divine';
    if (s >= 1200) return 'prismatic';
    if (s >= 500) return 'mythical';
    if (s >= 100 || pr >= 8000) return 'rare';
    return 'common';
  }
  const PACK_RARITY = { common_magic_pack: 'common', rare_magic_pack: 'rare', mythical_magic_pack: 'mythical', prismatic_magic_pack: 'prismatic', divine_magic_pack: 'divine', transcendent_magic_pack: 'transcendent' };

  const ITEMS = {};
  const statText = (it) => {
    const parts = [];
    const add = (k, label, suffix = '') => { if (it[k]) parts.push(`+${it[k]}${suffix} ${label}`); };
    add('atk', 'ATK'); add('def', 'DEF'); add('magic_atk', 'Magic ATK'); add('magic_def', 'Magic DEF');
    add('atk_bonus', 'ATK'); add('def_bonus', 'DEF'); add('hp_bonus', 'HP'); add('mana_bonus', 'Mana');
    add('magic_atk_bonus', 'Magic ATK'); add('magic_def_bonus', 'Magic DEF'); add('crit_bonus', 'Crit', '%'); add('lifesteal_bonus', 'Lifesteal', '%');
    add('heal_pct', 'recovery after battle', '%');
    return parts.join(', ');
  };
  // ---- after-battle recovery on armor: small for not-so-rare, big for very rare ----
  const ARMOR_HEAL_BY_RARITY = { common: 0, rare: 3, mythical: 5, prismatic: 8, divine: 12, transcendent: 20 };
  const ARMOR_HEAL_SPECIAL = { plate_armor: 1, diamond_armor: 2, forged_bone_armor: 1, forged_troll_armor: 4 };   // troll armor "regenerates"
  for (const [k, it] of Object.entries(D.ARMORS)) it.heal_pct = ARMOR_HEAL_SPECIAL[k] ?? ARMOR_HEAL_BY_RARITY[equipRarity(it)];
  // ---- after-battle recovery on titles (uses the original hp_regen_percent field, which was always 0) ----
  const TITLE_HEAL_BY_RARITY = { common: 1, rare: 3, mythical: 5, prismatic: 7, divine: 10, transcendent: 15 };
  for (const [k, t] of Object.entries(D.TITLES)) t.hp_regen_percent = k === 'novice' ? 0 : TITLE_HEAL_BY_RARITY[t.rarity] || 0;
  D.TITLES.warrior.hp_regen_percent = 2;
  for (const [cat, tbl] of Object.entries(catTable)) {
    for (const [k, it] of Object.entries(D[tbl])) {
      ITEMS[k] = { key: k, cat, name: it.name, rarity: equipRarity(it), price: it.price || 0, score_price: it.score_price || 0,
        desc: (it.desc ? it.desc + ' ' : '') , stats: statText(it), data: it,
        power: (it.atk || 0) + (it.def || 0) + (it.magic_atk || 0) + (it.magic_def || 0) + (it.atk_bonus || 0) * 2 + (it.def_bonus || 0) * 2 + (it.hp_bonus || 0) + (it.mana_bonus || 0) + (it.crit_bonus || 0) * 3 + (it.lifesteal_bonus || 0) * 3 + (it.magic_atk_bonus || 0) * 2 + (it.magic_def_bonus || 0) * 2 + (it.heal_pct || 0) * 3 };
    }
  }
  for (const [k, it] of Object.entries(D.POTIONS)) {
    const isBuff = it.effect.startsWith('buff');
    ITEMS[k] = { key: k, cat: isBuff ? 'buff' : 'potion', name: it.name, rarity: it.rarity || 'common', price: D.CONSUMABLE_PRICES[k] || 50, desc: D.POTION_TEXT[k] || '', stats: '', data: it, power: it.amount || 0 };
  }
  for (const [k, it] of Object.entries(D.MATERIALS)) {
    ITEMS[k] = { key: k, cat: 'material', name: it.name, rarity: it.rarity, price: 0, desc: it.desc, stats: '', data: it, power: D.RARITY_RANK[it.rarity] };
  }
  for (const [k, it] of Object.entries(D.MAGIC_PACKS)) {
    ITEMS[k] = { key: k, cat: 'pack', name: it.name, rarity: PACK_RARITY[k], price: D.PACK_PRICES[k] || 0, desc: it.description, stats: `Tier ${it.tier}`, data: it, power: D.RARITY_RANK[PACK_RARITY[k]] };
  }
  const upText = {
    atk_increase: v => `+${v} ATK permanently`, def_increase: v => `+${v} DEF permanently`, hp_increase: v => `+${v} max HP permanently`,
    magic_increase: v => `+${v} max Mana permanently`, crit_chance_increase: v => `+${v}% crit chance permanently`,
    mana_regen_increase: v => `+${v} Mana regen per turn`, magic_def_increase: v => `+${v} Magic DEF permanently`,
    max_lifesteal_increase: v => `+${v}% lifesteal amount`, lifesteal_chance_increase: v => `+${v}% lifesteal chance`, exp_increase: v => `+${v}% EXP gain`, exp_gain_increase: v => `+${v}% EXP gain (separate multiplier, stacks with everything)`,
  };
  for (const [k, it] of Object.entries(D.PERM_UPGRADES)) {
    const f = Object.keys(it).find(x => x !== 'name');
    ITEMS[k] = { key: k, cat: 'upgrade', name: it.name, rarity: 'rare', price: 0, desc: upText[f] ? upText[f](it[f]) : '', stats: '', data: it, field: f, power: 1 };
  }
  D.ITEMS = ITEMS;
  ITEMS.perm_exp_gain_upgrade.rarity = 'divine';

  D.CAT_ICON = { weapon: '⚔️', armor: '🛡️', wand: '🔱', robe: '👘', necklace: '📿', potion: '🧪', buff: '✨', material: '🦴', pack: '📦', upgrade: '💎', spell: '🔮', title: '👑' };
  D.CAT_LABEL = { weapon: 'Weapon', armor: 'Armor', wand: 'Wand', robe: 'Robe', necklace: 'Necklace', potion: 'Potion', buff: 'Buff', material: 'Material', pack: 'Magic Pack', upgrade: 'Upgrade' };
  D.SPELL_RARITY = { 'D(Common)': 'common', 'C(Rare)': 'rare', 'B(Mythical)': 'mythical', 'A(Prismatic)': 'prismatic', 'S(Divine)': 'divine', 'SS(Transcendent)': 'transcendent' };
  D.CLASS_RARITY = D.SPELL_RARITY;
  D.ELEMENT_ICON = { fire: '🔥', ice: '❄️', lightning: '⚡', wind: '🌪️', nature: '🌿', mana: '💠', heal: '💚', holy: '☀️', '': '💠' };
})();
