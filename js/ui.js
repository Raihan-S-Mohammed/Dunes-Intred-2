"use strict";
/* Rendering + event handling. Every action mutates G, then calls render(). */

const UI = {
  page: 'dungeon',
  authTab: 'login',
  authMsg: '',
  inv: { tab: 'all', q: '', eq: 'all', sort: 'rarity', spellView: 'learned' },
  shop: { tab: 'consumables', q: '' },
  craft: { tab: 'all', q: '', only: false },
  sellQ: '',
  fightPanel: 'main',
  barMem: {}, busy: false, hold: false, exploring: false, enter: false,
  console: { open: false, authed: false, lines: [], history: [], hIdx: -1 },
};

// ---------- helpers ----------
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function fmt(n) {
  if (n === Infinity) return '∞';
  n = Math.floor(n || 0);
  const a = Math.abs(n);
  if (a < 1e6) return n.toLocaleString();
  const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M']];
  for (const [v, u] of units) if (a >= v) return (n / v).toFixed(2).replace(/\.?0+$/, '') + u;
  return String(n);
}
const pctOf = (c, m) => m > 0 && m !== Infinity ? clamp(c / m * 100, 0, 100) : 100;
/* Bars with a `key` animate from their previous value (UI.barMem) to the new one,
   and HP bars leave a fading "damage lag" chunk behind. */
function bar(cur, max, cls, label, key) {
  const pct = pctOf(cur, max);
  const old = key && UI.barMem[key] !== undefined ? UI.barMem[key] : pct;
  const lag = key && /\bhp\b/.test(cls) ? `<div class="lag" data-bk="${key}" data-to="${pct}" style="width:${Math.max(old, pct)}%"></div>` : '';
  return `<div class="bar ${cls}" title="${esc(label || '')}">${lag}<div class="fill" ${key ? `data-bk="${key}" data-to="${pct}"` : ''} style="width:${key ? old : pct}%"></div><span>${label ?? `${fmt(cur)} / ${fmt(max)}`}</span></div>`;
}
function animateBars() {
  const els = document.querySelectorAll('[data-bk]');
  els.forEach(el => { if (el.classList.contains('fill')) UI.barMem[el.dataset.bk] = Number(el.dataset.to); });
  requestAnimationFrame(() => requestAnimationFrame(() => els.forEach(el => { el.style.width = el.dataset.to + '%'; })));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* floating combat numbers, rendered in a fixed overlay so re-renders don't kill them */
function playFx() {
  const list = G.fight ? G.fight.fx.splice(0) : [];
  list.forEach((fx, i) => setTimeout(() => {
    const target = document.getElementById(fx.who === 'monster' ? 'fx-monster' : 'fx-player');
    if (!target) return;
    const r = target.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = `float k-${fx.kind}`;
    el.textContent = fx.text;
    el.style.left = (r.left + r.width / 2 + randInt(-50, 50)) + 'px';
    el.style.top = (r.top + Math.min(r.height * 0.45, 90)) + 'px';
    $('#fx-layer').appendChild(el);
    setTimeout(() => el.remove(), 1200);
    if (['dmg', 'crit', 'magic', 'enemy', 'enemymagic'].includes(fx.kind)) {
      target.classList.remove('shake', 'flash'); void target.offsetWidth;
      target.classList.add('shake', fx.kind === 'crit' ? 'flash' : 'x');
    }
  }, i * 140));
}
const TURN_PAUSE = 650, END_PAUSE = 1100, EXPLORE_PAUSE = 750;
/* player acts -> pause -> monster acts. Buttons are locked while UI.busy. */
async function doFight(action, arg) {
  if (UI.busy || !G.fight || G.fight.over) return;
  if (!G.act(action, arg)) { render(); return; }
  if (action !== 'item' && action !== 'spell') UI.fightPanel = 'main';
  const f = G.fight;
  UI.busy = true;
  if (f.over) UI.hold = true;
  render(); playFx();
  if (f.pending) {
    await sleep(TURN_PAUSE);
    G.monsterPhase();
    if (f.over) UI.hold = true;
    render(); playFx();
  }
  if (f.over) { await sleep(END_PAUSE); UI.hold = false; }
  UI.busy = false;
  render();
}
async function startExplore(ambush) {
  if (UI.busy) return;
  if (G.fight && G.fight.over) G.endFight();
  if (G.fight) return;
  UI.busy = true; UI.exploring = true; UI.fightPanel = 'main'; UI.page = 'dungeon';
  render();
  await sleep(EXPLORE_PAUSE);
  UI.exploring = false; UI.enter = true;
  G.startFight(ambush ? { ambush: true } : {});
  if (G.fight.over) UI.hold = true;
  render(); playFx();
  if (G.fight.over) { await sleep(END_PAUSE); UI.hold = false; }
  UI.busy = false;
  render();
}
const rarityTag = r => `<span class="rar rar-${r}">${r}</span>`;
const match = (q, ...fields) => !q || fields.some(f => String(f || '').toLowerCase().includes(q.toLowerCase()));
function areaName(a) {
  if (a <= 20) return 'Verdant Outskirts'; if (a <= 40) return 'Bandit Badlands'; if (a <= 60) return 'Shadow Reaches';
  if (a <= 80) return 'Prismatic Rift'; if (a < 100) return 'Divine Expanse'; return 'Throne of the Abyss';
}
function titleBoostText(t) {
  const L = { atk_boost: 'ATK', def_boost: 'DEF', hp_boost: 'HP', mana_boost: 'Mana', exp_boost: '% EXP', material_discount_percent: '% craft discount', money_boost_percent: '% money', material_boost_percent: '% material drops', treasure_boost_percent: '% treasure', crit_chance_percent: '% crit', death_penalty_percent: '% death money loss', atk_percent: '% ATK', def_percent: '% DEF', hp_percent: '% HP', mana_percent: '% Mana' };
  const out = [];
  for (const [k, l] of Object.entries(L)) if (t[k]) out.push(`${t[k] > 0 ? '+' : ''}${t[k]}${l.startsWith('%') ? l : ' ' + l}`);
  return out.join(', ') || 'No bonuses';
}
function flushEvents() {
  for (const e of G.events.splice(0)) toast(e.msg, e.type);
}
function toast(msg, type = 'info') {
  if (!msg) return;
  const el = document.createElement('div');
  el.className = `toast t-${type}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3700);
}
const result = r => { if (r && r.msg) toast(r.msg, r.ok ? 'good' : 'bad'); };
function qtyOf(el) {
  const card = el.closest('[data-qwrap]');
  const inp = card && card.querySelector('input.qty');
  const v = inp ? parseInt(inp.value, 10) : 1;
  return Number.isFinite(v) && v > 0 ? v : 1;
}
const qtyInput = (max) => { const m = Math.min(max || BAL.MAX_STACK, BAL.MAX_STACK); return `<input class="qty" type="number" min="1" max="${m}" value="1" aria-label="Quantity" title="Max ${m.toLocaleString()}">`; };

// ---------- modal ----------
function modal(title, body, opts = {}) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-bg" data-act="modal-close-bg"><div class="modal ${opts.cls || ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h3>${title}</h3><button class="icon-btn" data-act="modal-close" aria-label="Close">✕</button></div>
    <div class="modal-body">${body}</div></div></div>`;
  const first = root.querySelector('input, textarea');
  if (first) first.focus();
}
function closeModal() { $('#modal-root').innerHTML = ''; UI.console.open = false; }
function confirmModal(title, text, onYes, danger) {
  UI._confirm = onYes;
  modal(title, `<p>${text}</p><div class="row end"><button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-act="confirm-yes">Confirm</button></div>`);
}

// ================= RENDER =================
function render() {
  const ae = document.activeElement;
  const focusId = ae && ae.id; const selStart = ae && ae.selectionStart;
  const app = $('#app');
  if (!G.user) app.innerHTML = renderAuth();
  else if (!G.user.avatar) app.innerHTML = renderAvatarPage(true);   // avatar creator right after account creation
  else app.innerHTML = renderShell();
  if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); try { if (selStart != null) el.setSelectionRange(selStart, selStart); } catch (e) { } } }
  const log = $('#battle-log'); if (log) log.scrollTop = log.scrollHeight;
  animateBars();
  flushEvents();
}

// ---------- auth ----------
function renderAuth() {
  const rem = Store.data.remember && Store.data.users[Store.data.remember];
  const lb = G.leaderboard();
  return `<div class="auth-wrap">
    <div class="auth-card">
      <div class="logo big">⚔️ The Dunes Intred</div>
      <p class="muted center">A dungeon-crawling RPG. Fight monsters, collect loot, master spells.</p>
      ${rem ? `<button class="btn primary wide" data-act="continue">Continue as <b>${esc(rem.username)}</b></button><div class="divider"><span>or</span></div>` : ''}
      <div class="tabs small">
        <button class="tab ${UI.authTab === 'login' ? 'on' : ''}" data-act="auth-tab" data-v="login">Login</button>
        <button class="tab ${UI.authTab === 'signup' ? 'on' : ''}" data-act="auth-tab" data-v="signup">Sign up</button>
      </div>
      <form id="auth-form" class="stack" data-form="${UI.authTab}">
        <label>Username<input id="auth-user" autocomplete="username" required></label>
        <label>Password<input id="auth-pass" type="password" autocomplete="${UI.authTab === 'login' ? 'current-password' : 'new-password'}" required></label>
        <label class="check"><input id="auth-remember" type="checkbox" checked> Remember me on this device</label>
        ${UI.authMsg ? `<div class="err">${esc(UI.authMsg)}</div>` : ''}
        <button class="btn primary wide" type="submit">${UI.authTab === 'login' ? 'Enter the Dunes' : 'Create hero'}</button>
      </form>
    </div>
    <div class="auth-card lb">
      <h3>🏆 Leaderboard</h3>
      ${lb.length ? `<ol class="lb-list">${lb.map(r => `<li><span>${esc(r.name)}</span><span class="muted">Lv ${r.level}</span><b>${fmt(r.score)}</b></li>`).join('')}</ol>` : '<p class="muted">No heroes yet. Be the first!</p>'}
    </div>
  </div>`;
}

// ---------- shell ----------
const NAV = [['dungeon', '🗡️', 'Dungeon'], ['inventory', '🎒', 'Inventory'], ['shop', '🏪', 'Shop'], ['craft', '⚒️', 'Crafting'], ['hero', '🧙', 'Hero'], ['profile', '👤', 'Profile'], ['trades', '🤝', 'Trades'], ['achievements', '🏆', 'Achievements'], ['leaderboard', '📜', 'Leaderboard'], ['settings', '⚙️', 'Settings']];
const FIGHT_OK_PAGES = ['dungeon', 'inventory', 'hero', 'profile'];
function renderShell() {
  const p = G.p, d = G.derive(), u = G.user;
  const next = G.expToNext(p.level);
  const inFight = G.fight && !G.fight.over;
  const expLabel = next === Infinity ? 'MAX LEVEL' : (p.settings.show_exp_bar ? `${Math.floor(pctOf(p.exp, next))}%` : `${fmt(p.exp)} / ${fmt(next)}`);
  return `<header class="topbar">
    <div class="logo">⚔️ <span>The Dunes Intred</span></div>
    <div class="hud">
      <button class="hud-av" data-act="view-profile" data-v="${esc(u.username)}" title="View profile">${avatarSVG(u.avatar, 40)}</button>
      <div class="hud-name"><b>${esc(G.displayName())}</b><span class="lvl">Lv ${fmt(p.level)}</span></div>
      <div class="hud-bars">
        ${bar(p.hp, d.hpMax, 'hp', `❤ ${fmt(p.hp)} / ${fmt(d.hpMax)}`, 'hud-hp')}
        ${bar(p.mana, d.manaMax, 'mp', `💧 ${fmt(p.mana)} / ${fmt(d.manaMax)}`, 'hud-mp')}
        ${bar(p.exp, next, 'xp', `EXP ${expLabel}`, 'hud-xp')}
      </div>
      <div class="hud-money"><span title="Money">💰 ${fmt(u.money)}</span><span title="Score">⭐ ${fmt(u.score)}</span><span title="Area">🗺️ ${p.area}</span></div>
    </div>
    <div class="bell-wrap"><button class="icon-btn bell" data-act="bell" aria-label="Notifications">🔔${G.unreadCount() ? `<i class="badge">${G.unreadCount()}</i>` : ''}</button>${UI.notifOpen ? renderNotifPanel() : ''}</div>
    <button class="btn ghost sm" data-act="logout">Logout</button>
  </header>
  <div class="layout">
    <nav class="sidenav">${NAV.map(([k, ic, l]) => `<button class="nav-btn ${UI.page === k ? 'on' : ''}" data-act="nav" data-v="${k}" ${inFight && !FIGHT_OK_PAGES.includes(k) ? 'disabled title="Finish the fight first"' : ''}><span>${ic}</span><em>${l}</em>${k === 'dungeon' && inFight ? '<i class="dot"></i>' : ''}${k === 'trades' && G.pendingIncoming() ? `<i class="badge">${G.pendingIncoming()}</i>` : ''}</button>`).join('')}</nav>
    <main id="main">${renderPage()}</main>
  </div>`;
}
function renderPage() {
  switch (UI.page) {
    case 'dungeon': return renderDungeon();
    case 'inventory': return renderInventory();
    case 'shop': return renderShop();
    case 'craft': return renderCraft();
    case 'hero': return renderHero();
    case 'achievements': return renderAchievements();
    case 'leaderboard': return renderLeaderboard();
    case 'profile': return renderProfile();
    case 'trades': return renderTrades();
    case 'avatar': return renderAvatarPage(false);
    case 'settings': return renderSettings();
  }
  return '';
}

// ---------- dungeon ----------
function buffChips(p) {
  if (!p.buffs.length) return '<span class="muted">No active buffs</span>';
  const grouped = {};
  for (const b of p.buffs) {
    if (D.MULT_BUFFS.includes(b.type)) continue;
    const g = grouped[b.type] || (grouped[b.type] = { amount: 0, remaining: 0, name: b.name }); g.amount += b.amount; g.remaining = Math.max(g.remaining, b.remaining);
  }
  const label = { atk: 'ATK', def: 'DEF', crit: 'Crit %', hp_regen: 'HP/turn', mana_regen: 'Mana/turn' };
  const multChip = (type, icon, label, cls) => {
    const q = G.multQueue(type, p); if (!q.length) return '';
    const queued = q.slice(1).reduce((s, b) => s + b.remaining, 0);
    return `<span class="chip buff ${cls}" title="Queue: ${q.map(b => `×${b.amount.toLocaleString()} for ${b.remaining} battles`).join(' → ')}">${icon} ×${fmt(q[0].amount)} ${label} · ${q[0].remaining} battle${q[0].remaining > 1 ? 's' : ''}${queued ? ` (+${queued} queued)` : ''}</span>`;
  };
  return multChip('exp_mult', '📈', 'EXP', 'exp') + multChip('coin_mult', '💰', 'coins', 'coin') + Object.entries(grouped).map(([t, g]) => `<span class="chip buff" title="${esc(g.name)}">✨ +${g.amount} ${label[t] || t} · ${g.remaining} fight${g.remaining > 1 ? 's' : ''}</span>`).join('');
}
function renderDungeon() {
  const f = G.fight;
  if (f && (!f.over || UI.hold)) return renderFight();
  if (f && f.over) return renderFightResult();
  if (UI.exploring) return `<div class="exploring"><div class="torch">🔦</div><h2>Exploring Area ${G.p.area}…</h2><p class="muted">Something stirs in the dark.</p></div>`;
  const p = G.p, d = G.derive(), t = G.treasure, maxA = G.maxArea();
  return `<div class="page-head"><h2>🗡️ The Dungeon</h2><p class="muted">Area ${p.area} — ${areaName(p.area)}</p></div>
  <div class="grid-2">
    <section class="panel hero-explore">
      <div class="area-badge"><div class="area-num">${p.area}</div><div><b>${areaName(p.area)}</b><div class="muted">Monsters scale with area. Unlocked up to area ${maxA}.</div></div></div>
      <div class="area-move">
        <button class="btn sm" data-act="area-step" data-v="-1" ${p.area <= 1 ? 'disabled' : ''}>◀</button>
        <input id="area-input" type="range" min="1" max="${maxA}" value="${p.area}" data-act-change="area-range" aria-label="Area">
        <button class="btn sm" data-act="area-step" data-v="1" ${p.area >= maxA ? 'disabled' : ''}>▶</button>
      </div>
      <div class="muted small center">Next area unlock: ${maxA >= BAL.AREAS ? 'all areas unlocked' : `Area ${maxA + 1} at level ${G.areaMinLevel(maxA + 1)}`}</div>
      <button class="btn primary huge" data-act="explore">🔦 Explore <kbd>E</kbd></button>
      <div class="row">
        <button class="btn wide" data-act="treasure">💎 Search for treasure</button>
        <button class="btn wide" data-act="rest">🛏️ Rest at inn ($${fmt(G.innCost())})</button>
      </div>
    </section>
    <section class="panel">
      <h3>Status</h3>
      ${bar(p.hp, d.hpMax, 'hp', `❤ HP ${fmt(p.hp)} / ${fmt(d.hpMax)}`)}
      ${bar(p.mana, d.manaMax, 'mp', `💧 Mana ${fmt(p.mana)} / ${fmt(d.manaMax)}`)}
      <div class="statgrid">
        <div><span>ATK</span><b>${fmt(d.atk)}</b></div><div><span>DEF</span><b>${fmt(d.def)}</b></div>
        <div><span>Magic ATK</span><b>${fmt(d.magicAtk)}</b></div><div><span>Magic DEF</span><b>${fmt(d.magicDef)}</b></div>
        <div><span>Crit</span><b>${d.crit}%</b></div><div><span>Dodges</span><b>${p.dodge}/${p.max_dodge}</b></div>
      </div>
      <h4>Buffs</h4><div class="chips">${buffChips(p)}</div>
      <h4>Spell slots</h4>
      <div class="chips">${p.equipped_spells.map((k, i) => k ? `<span class="chip">${i + 1}. ${D.ELEMENT_ICON[D.SPELLS_BY_KEY[k].type] || ''} ${esc(D.SPELLS_BY_KEY[k].name)}</span>` : `<span class="chip empty">${i + 1}. empty</span>`).join('')}
        <button class="btn sm ghost" data-act="goto-spells">Manage</button></div>
      <h4>Dungeon treasure</h4>
      <p class="muted">💰 $${fmt(t.money)} hoarded · ${t.items.length} items lost in the depths. Defeat bosses to reclaim 10% of it.</p>
    </section>
  </div>`;
}
function renderFight() {
  const f = G.fight, m = f.m, p = G.p, d = G.derive();
  const rar = D.CLASS_RARITY[m.class] || 'common';
  const lock = UI.busy || f.over ? 'disabled' : '';
  const enter = UI.enter ? 'enter' : ''; UI.enter = false;
  const turnLabel = f.over ? (f.result && f.result.type === 'win' ? '🎉 Victory!' : f.result && f.result.type === 'lose' ? '☠️ Defeated…' : '🏃 Escaped!') : f.pending ? `${esc(m.name)} is acting…` : 'Your turn';
  let sub = '';
  if (UI.fightPanel === 'magic') {
    sub = `<div class="subpanel"><div class="spell-row">${p.equipped_spells.map((k, i) => {
      if (!k) return `<button class="spell-btn empty" disabled>${i + 1}. Empty slot</button>`;
      const s = D.SPELLS_BY_KEY[k]; const ok = p.mana >= s.mana && p.level >= s.lvl;
      return `<button class="spell-btn r-${D.SPELL_RARITY[s.class]}" data-act="fight" data-v="spell" data-arg="${i}" ${ok && !lock ? '' : 'disabled'}>
        <b>${i + 1}. ${D.ELEMENT_ICON[s.type] || '💠'} ${esc(s.name)}</b><small>${s.mana} mana · ${s.power ? 'power ' + s.power : esc(s.desc)}</small></button>`;
    }).join('')}</div>${p.equipped_spells.some(Boolean) ? '' : '<p class="muted">No spells equipped. Open <a href="#" data-act="goto-spells">Inventory → Spells</a> to equip.</p>'}</div>`;
  } else if (UI.fightPanel === 'items') {
    const items = Object.keys(p.inventory).map(k => D.ITEMS[k]).filter(it => it && (it.cat === 'potion' || it.cat === 'buff'));
    sub = `<div class="subpanel"><div class="item-row">${items.length ? items.map(it => `<button class="item-btn" data-act="fight" data-v="item" data-arg="${it.key}" ${lock}>${D.CAT_ICON[it.cat]} ${esc(it.name)} <b>×${G.inv(it.key)}</b><small>${esc(it.desc)}</small></button>`).join('') : '<p class="muted">No potions or buffs. Buy some in the shop.</p>'}</div></div>`;
  }
  return `<div class="fight">
    <div class="combatants">
      <section class="panel fighter" id="fx-player">
        <div class="f-name">🧙 ${esc(G.displayName())} <span class="lvl">Lv ${p.level}</span></div>
        ${bar(p.hp, d.hpMax, 'hp big', `❤ ${fmt(p.hp)} / ${fmt(d.hpMax)}`, 'f-hp')}
        ${bar(p.mana, d.manaMax, 'mp', `💧 ${fmt(p.mana)} / ${fmt(d.manaMax)}`, 'f-mp')}
        <div class="pips" title="Dodges">${Array.from({ length: p.max_dodge }, (_, i) => `<i class="${i < p.dodge ? 'on' : ''}"></i>`).join('')}<span class="muted small">dodges</span></div>
        <div class="chips">${buffChips(p)}${f.barrier ? `<span class="chip good">🛡 Barrier ×${f.barrier}</span>` : ''}${f.reflect ? '<span class="chip good">🔁 Reflect ready</span>' : ''}</div>
        <div class="muted small">ATK ${fmt(d.atk)} · DEF ${fmt(d.def)} · MDEF ${fmt(d.magicDef)} · Crit ${d.crit}%</div>
      </section>
      <div class="vs"><span>VS</span><small class="turn ${f.pending ? 'enemy' : ''}">${turnLabel}</small></div>
      <section class="panel fighter monster r-${rar} ${m.is_boss ? 'boss' : ''} ${enter} ${f.over && f.result && f.result.type === 'win' ? 'dead' : ''}" id="fx-monster">
        <div class="f-name">${m.is_super_boss ? '👹' : m.is_boss ? '🔥' : '👾'} ${esc(m.name)} ${m.is_super_boss ? '<span class="tag super">SUPER BOSS</span>' : m.is_boss ? '<span class="tag boss">BOSS</span>' : ''}</div>
        ${bar(Math.max(0, m.hp), m.maxHp, 'hp enemy big', `${fmt(Math.max(0, m.hp))} / ${fmt(m.maxHp)}`, 'm-hp-' + f.id)}
        <div class="muted small">${rarityTag(rar)} · ${D.ELEMENT_ICON[m.element || ''] || ''} ${esc(m.element || 'neutral')} · ATK ${fmt(m.atk_min)}–${fmt(m.atk_max)}</div>
        ${f.stunned ? '<span class="chip good">💫 Stunned</span>' : ''}
      </section>
    </div>
    <div class="actions">
      <button class="btn act-attack" data-act="fight" data-v="attack" ${lock}>⚔️ Attack <kbd>A</kbd></button>
      <button class="btn act-magic ${UI.fightPanel === 'magic' ? 'on' : ''}" data-act="fight-panel" data-v="magic" ${lock}>🔮 Magic <kbd>M</kbd></button>
      <button class="btn act-dodge" data-act="fight" data-v="dodge" ${p.dodge > 0 && !lock ? '' : 'disabled'}>💨 Dodge (${p.dodge}) <kbd>D</kbd></button>
      <button class="btn act-item ${UI.fightPanel === 'items' ? 'on' : ''}" data-act="fight-panel" data-v="items" ${lock}>🧪 Items <kbd>P</kbd></button>
      <button class="btn act-run" data-act="fight" data-v="run" ${lock}>🏃 Run <kbd>R</kbd></button>
    </div>
    ${sub}
    <section class="panel log-panel"><div id="battle-log" class="log">${f.log.map(l => `<div class="l-${l.type}">${esc(l.msg)}</div>`).join('')}</div></section>
  </div>`;
}
function renderFightResult() {
  const f = G.fight, r = f.result, m = f.m;
  let body = '';
  if (r.type === 'win') {
    const drops = Object.entries(r.drops);
    body = `<div class="result win"><div class="big-emoji">🎉</div><h2>Victory over ${esc(m.name)}!</h2>
      <div class="rewards">
        <div><span>Money</span><b>+$${fmt(r.money)}</b></div>
        ${r.treasure ? `<div><span>Treasure reclaimed</span><b>+$${fmt(r.treasure)}</b></div>` : ''}
        <div><span>Score</span><b>+${fmt(r.score)}</b></div>
        <div><span>EXP</span><b>+${fmt(r.exp)}</b></div>
      </div>
      ${r.levels.length ? `<div class="levelup">⬆️ LEVEL UP! You reached level ${r.levels[r.levels.length - 1]}!</div>` : ''}
      ${drops.length ? `<h4>Loot</h4><div class="chips center">${drops.map(([k, n]) => { const it = D.ITEMS[k]; return `<span class="chip r-${it ? it.rarity : 'common'}">${it ? D.CAT_ICON[it.cat] + ' ' + esc(it.name) : esc(k)} ×${n}</span>`; }).join('')}</div>` : '<p class="muted">No item drops.</p>'}
    </div>`;
  } else if (r.type === 'lose') {
    body = `<div class="result lose"><div class="big-emoji">☠️</div><h2>Defeated by ${esc(m.name)}</h2>
      <p>You lost <b>$${fmt(r.lostMoney)}</b> to the dungeon treasure.</p>
      ${r.lostItems.length ? `<p>Items lost: ${r.lostItems.map(k => esc(D.ITEMS[k] ? D.ITEMS[k].name : k)).join(', ')}</p>` : '<p class="muted">No items lost.</p>'}
      <p class="muted">You wake at camp fully restored.</p></div>`;
  } else body = `<div class="result"><div class="big-emoji">🏃</div><h2>You escaped from ${esc(m.name)}</h2></div>`;
  return `<section class="panel">${body}
    <div class="row center"><button class="btn" data-act="end-fight">Back to camp</button><button class="btn primary" data-act="explore">🔦 Explore again <kbd>E</kbd></button></div></section>
    <section class="panel log-panel"><div id="battle-log" class="log">${f.log.map(l => `<div class="l-${l.type}">${esc(l.msg)}</div>`).join('')}</div></section>`;
}

// ---------- inventory ----------
const INV_TABS = [['all', 'All'], ['equipment', 'Equipment'], ['consumables', 'Consumables'], ['materials', 'Materials'], ['packs', 'Magic Packs'], ['upgrades', 'Upgrades'], ['spells', 'Spells'], ['titles', 'Titles']];
const TAB_CATS = { all: null, equipment: ['weapon', 'armor', 'wand', 'robe', 'necklace'], consumables: ['potion', 'buff'], materials: ['material'], packs: ['pack'], upgrades: ['upgrade'] };
function invItems(tab) {
  const p = G.p, cats = TAB_CATS[tab];
  return Object.keys(p.inventory).map(k => D.ITEMS[k]).filter(it => it && (!cats || cats.includes(it.cat)));
}
function sortItems(list, mode) {
  const by = {
    rarity: (a, b) => D.RARITY_RANK[b.rarity] - D.RARITY_RANK[a.rarity] || b.power - a.power || a.name.localeCompare(b.name),
    name: (a, b) => a.name.localeCompare(b.name),
    count: (a, b) => G.inv(b.key) - G.inv(a.key),
    power: (a, b) => b.power - a.power,
  };
  return list.sort(by[mode] || by.rarity);
}
function itemCard(it, ctx = 'inv') {
  const p = G.p, n = G.inv(it.key), isEq = it.cat in p.equipped, equipped = isEq && p.equipped[it.cat] === it.key;
  let actions = '';
  if (isEq) actions = equipped ? `<span class="chip good">✓ Equipped</span><button class="btn sm ghost" data-act="unequip" data-v="${it.cat}">Unequip</button>` : `<button class="btn sm primary" data-act="equip" data-v="${it.key}">Equip</button>`;
  else if (it.cat === 'potion' || it.cat === 'buff') actions = `${qtyInput(Math.min(n, BAL.USE_LIMIT))}<button class="btn sm primary" data-act="use" data-v="${it.key}">Use</button>${n > 1 ? `<button class="btn sm" data-act="use-all" data-v="${it.key}" title="Uses up to ${BAL.USE_LIMIT.toLocaleString()} per click">All</button>` : ''}`;
  else if (it.cat === 'pack') actions = `${qtyInput(Math.min(n, BAL.USE_LIMIT))}<button class="btn sm primary" data-act="open-pack" data-v="${it.key}">Open</button><button class="btn sm" data-act="open-pack-all" data-v="${it.key}">All</button>`;
  else if (it.cat === 'upgrade') actions = `${qtyInput(n)}<button class="btn sm primary" data-act="use-upgrade" data-v="${it.key}">Use</button><button class="btn sm" data-act="use-upgrade-all" data-v="${it.key}">All</button>`;
  else if (it.cat === 'material') { const uses = Object.values(D.RECIPES).filter(r => it.key in r.materials).length; actions = `<span class="muted small">Used in ${uses} recipe${uses === 1 ? '' : 's'}</span>`; }
  return `<div class="card r-${it.rarity} ${equipped ? 'is-eq' : ''}" data-qwrap>
    <div class="card-head"><span class="icon">${D.CAT_ICON[it.cat]}</span><div class="grow"><div class="name">${esc(it.name)}</div><div class="sub">${D.CAT_LABEL[it.cat]} · ${rarityTag(it.rarity)}</div></div><span class="count">×${fmt(n)}</span>
      <button class="pin ${G.user.profile.showcase.includes(it.key) ? 'on' : ''}" data-act="showcase" data-v="${it.key}" title="${G.user.profile.showcase.includes(it.key) ? 'Remove from profile showcase' : 'Pin to profile showcase'}">${G.user.profile.showcase.includes(it.key) ? '★' : '☆'}</button></div>
    <div class="desc">${it.stats ? `<b>${esc(it.stats)}</b> ` : ''}${esc(it.desc)}</div>
    <div class="card-actions">${actions}</div></div>`;
}
function renderInventory() {
  const p = G.p, I = UI.inv;
  const counts = {}; for (const [t] of INV_TABS) counts[t] = TAB_CATS[t] !== undefined ? invItems(t).length : 0;
  counts.spells = p.learned_spells.length; counts.titles = p.titles.length;
  const tabs = `<div class="tabs" role="tablist">${INV_TABS.map(([k, l]) => `<button class="tab ${I.tab === k ? 'on' : ''}" data-act="inv-tab" data-v="${k}">${l}<em>${counts[k]}</em></button>`).join('')}</div>`;
  let body;
  if (I.tab === 'spells') body = renderSpellsTab();
  else if (I.tab === 'titles') body = renderTitlesTab();
  else {
    let list = invItems(I.tab).filter(it => match(I.q, it.name, it.desc, it.stats, it.cat, it.rarity));
    if (I.tab === 'equipment' && I.eq !== 'all') list = list.filter(it => it.cat === I.eq);
    list = sortItems(list, I.sort);
    let top = '';
    if (I.tab === 'equipment' || I.tab === 'all') top = equippedStrip();
    if (I.tab === 'upgrades') { const pm = p.perm; top = `<div class="panel slim row wrap"><span class="muted">Permanent: ATK +${fmt(pm.atk)} · DEF +${fmt(pm.def)} · HP +${fmt(pm.hp)} · Mana +${fmt(pm.mana)} · MDEF +${fmt(pm.magic_def)} · Crit +${pm.crit}% · Regen +${pm.mana_regen} · Lifesteal ${pm.lifesteal}% @ ${pm.lifesteal_chance}% · EXP +${pm.exp}%</span><button class="btn sm primary push" data-act="use-all-upgrades">Use all upgrades</button></div>`; }
    if (I.tab === 'packs') top = `<div class="panel slim row"><span class="muted">Packs teach random spells. Duplicates are refunded as a little money.</span><button class="btn sm primary push" data-act="open-all-packs">Open all packs</button></div>`;
    const eqFilter = I.tab === 'equipment' ? `<div class="chips">${['all', 'weapon', 'armor', 'wand', 'robe', 'necklace'].map(c => `<button class="chip btnchip ${I.eq === c ? 'on' : ''}" data-act="inv-eq" data-v="${c}">${c === 'all' ? 'All' : D.CAT_ICON[c] + ' ' + D.CAT_LABEL[c]}</button>`).join('')}</div>` : '';
    body = `${top}<div class="toolbar">${searchBox('inv-search', I.q, 'Search inventory…')}
      <select id="inv-sort" data-act-change="inv-sort" aria-label="Sort">${[['rarity', 'Sort: Rarity'], ['power', 'Sort: Power'], ['name', 'Sort: Name'], ['count', 'Sort: Count']].map(([v, l]) => `<option value="${v}" ${I.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      ${eqFilter}
      <div class="cards">${list.length ? list.map(it => itemCard(it)).join('') : `<div class="empty-state">${I.q ? 'No items match your search.' : 'Nothing here yet. Explore the dungeon!'}</div>`}</div>`;
  }
  return `<div class="page-head"><h2>🎒 Inventory</h2></div>${tabs}${body}`;
}
function searchBox(id, val, ph) { return `<div class="search"><span>🔍</span><input id="${id}" type="search" placeholder="${ph}" value="${esc(val)}" data-act-input="${id}" autocomplete="off">${val ? `<button class="icon-btn" data-act="clear-search" data-v="${id}" aria-label="Clear">✕</button>` : ''}</div>`; }
function equippedStrip() {
  const p = G.p;
  return `<div class="eq-strip">${['weapon', 'armor', 'wand', 'robe', 'necklace'].map(slot => {
    const k = p.equipped[slot], it = k && D.ITEMS[k];
    return `<div class="eq-slot ${it ? 'r-' + it.rarity : 'empty'}"><span class="icon">${D.CAT_ICON[slot]}</span><div class="grow"><div class="sub">${D.CAT_LABEL[slot]}</div><div class="name">${it ? esc(it.name) : 'Empty'}</div>${it ? `<div class="small muted">${esc(it.stats)}</div>` : ''}</div>
      ${it ? `<button class="icon-btn" data-act="unequip" data-v="${slot}" title="Unequip">✕</button>` : `<button class="btn sm ghost" data-act="equip-best" data-v="${slot}">Best</button>`}</div>`;
  }).join('')}<button class="btn sm primary" data-act="equip-best-all">⚡ Equip best of everything</button></div>`;
}
function spellCard(k, learned) {
  const s = D.SPELLS_BY_KEY[k], p = G.p, rar = D.SPELL_RARITY[s.class];
  const slot = p.equipped_spells.indexOf(k), lvOk = p.level >= s.lvl;
  let actions;
  if (!learned) {
    const packs = Object.entries(D.MAGIC_PACKS).filter(([, pk]) => pk.spells.includes(k)).map(([, pk]) => pk.name.replace(' Magic Pack', ''));
    actions = `<span class="muted small">Found in: ${packs.join(', ')} packs</span>`;
  } else if (!lvOk) actions = `<span class="chip bad">🔒 Requires Lv ${s.lvl}</span>`;
  else actions = (slot >= 0 ? `<span class="chip good">✓ Slot ${slot + 1}</span>` : `<button class="btn sm primary" data-act="spell-equip" data-v="${k}">Equip</button>`) +
    `<span class="slot-picks">${[0, 1, 2, 3].map(i => `<button class="slot-pick ${slot === i ? 'on' : ''}" data-act="spell-slot" data-v="${k}" data-arg="${i}" title="Put in slot ${i + 1}">${i + 1}</button>`).join('')}</span>`;
  return `<div class="card r-${rar} ${learned ? '' : 'locked'} ${slot >= 0 ? 'is-eq' : ''}">
    <div class="card-head"><span class="icon">${D.ELEMENT_ICON[s.type] || '💠'}</span><div class="grow"><div class="name">${esc(s.name)}</div><div class="sub">${esc(s.class)} · ${esc(s.type || 'arcane')} · Lv ${s.lvl}</div></div><span class="count">${s.mana}<small> mp</small></span></div>
    <div class="desc">${s.power ? `<b>Power ${s.power}</b> ` : ''}${esc(s.desc)}</div>
    <div class="card-actions">${actions}</div></div>`;
}
function renderSpellsTab() {
  const p = G.p, I = UI.inv;
  const slots = `<div class="spell-slots">${p.equipped_spells.map((k, i) => {
    const s = k && D.SPELLS_BY_KEY[k];
    return `<div class="spell-slot ${s ? 'r-' + D.SPELL_RARITY[s.class] : 'empty'}"><div class="slot-n">${i + 1}</div>${s ? `<div class="grow"><b>${D.ELEMENT_ICON[s.type] || '💠'} ${esc(s.name)}</b><div class="small muted">${s.mana} mana · ${s.power ? 'power ' + s.power : esc(s.desc)}</div></div><button class="icon-btn" data-act="spell-unequip" data-v="${i}" title="Unequip">✕</button>` : '<div class="grow muted">Empty slot</div>'}</div>`;
  }).join('')}</div>`;
  const keys = I.spellView === 'all' ? Object.keys(D.SPELLS_BY_KEY) : p.learned_spells.slice();
  const list = keys.filter(k => { const s = D.SPELLS_BY_KEY[k]; return match(I.q, s.name, s.desc, s.type, s.class); })
    .sort((a, b) => D.SPELLS_BY_KEY[a].lvl - D.SPELLS_BY_KEY[b].lvl);
  return `<div class="panel slim"><div class="row"><h3>Spell slots</h3><button class="btn sm primary push" data-act="spell-auto">⚡ Auto-equip best</button></div>${slots}</div>
    <div class="toolbar">${searchBox('inv-search', I.q, 'Search spells…')}
      <div class="chips"><button class="chip btnchip ${I.spellView === 'learned' ? 'on' : ''}" data-act="spell-view" data-v="learned">Learned (${p.learned_spells.length})</button><button class="chip btnchip ${I.spellView === 'all' ? 'on' : ''}" data-act="spell-view" data-v="all">All spells (${Object.keys(D.SPELLS_BY_KEY).length})</button></div></div>
    <div class="cards">${list.length ? list.map(k => spellCard(k, p.learned_spells.includes(k))).join('') : `<div class="empty-state">${I.q ? 'No spells match.' : 'You have not learned any spells. Open magic packs to learn some!'}</div>`}</div>`;
}
function renderTitlesTab() {
  const p = G.p, I = UI.inv;
  const slots = `<div class="spell-slots five">${p.equipped_titles.map((k, i) => {
    const t = k && D.TITLES[k];
    return `<div class="spell-slot ${t ? 'r-' + t.rarity : 'empty'}"><div class="slot-n">${i + 1}</div>${t ? `<div class="grow"><b>👑 ${esc(t.name)}</b></div><button class="icon-btn" data-act="title-unequip" data-v="${i}" title="Unequip">✕</button>` : '<div class="grow muted">Empty</div>'}</div>`;
  }).join('')}</div>`;
  const keys = Object.keys(D.TITLES).filter(k => { const t = D.TITLES[k]; return match(I.q, t.name, t.desc, t.rarity); })
    .sort((a, b) => (p.titles.includes(b) - p.titles.includes(a)) || D.RARITY_RANK[D.TITLES[a].rarity] - D.RARITY_RANK[D.TITLES[b].rarity]);
  const tb = G.titleBonus();
  return `<div class="panel slim"><div class="row"><h3>Title slots</h3><button class="btn sm primary push" data-act="title-auto">⚡ Auto-equip best</button></div>${slots}
    <p class="muted small">Total from titles: ${esc(titleBoostText(tb))}</p></div>
    <div class="toolbar">${searchBox('inv-search', I.q, 'Search titles…')}</div>
    <div class="cards">${keys.map(k => {
      const t = D.TITLES[k], has = p.titles.includes(k), on = p.equipped_titles.includes(k);
      return `<div class="card r-${t.rarity} ${has ? '' : 'locked'} ${on ? 'is-eq' : ''}">
        <div class="card-head"><span class="icon">👑</span><div class="grow"><div class="name">${esc(t.name)}</div><div class="sub">${rarityTag(t.rarity)}</div></div></div>
        <div class="desc"><b>${esc(titleBoostText(t))}</b> ${esc(t.desc)}</div>
        <div class="card-actions">${!has ? `<span class="muted small">🔒 ${esc(D.TITLE_UNLOCK[k] || 'Locked')}</span>` : on ? `<span class="chip good">✓ Equipped</span><button class="btn sm ghost" data-act="title-unequip" data-v="${p.equipped_titles.indexOf(k)}">Unequip</button>` : `<button class="btn sm primary" data-act="title-equip" data-v="${k}">Equip</button>`}</div></div>`;
    }).join('')}</div>`;
}

// ---------- shop ----------
const SHOP_TABS = [['consumables', '🧪 Potions & Buffs'], ['weapon', '⚔️ Weapons'], ['armor', '🛡️ Armor'], ['wand', '🔱 Wands'], ['robe', '👘 Robes'], ['necklace', '📿 Necklaces'], ['pack', '📦 Magic Packs'], ['sell', '💸 Sell']];
function renderShop() {
  const S = UI.shop, u = G.user;
  const tabs = `<div class="tabs">${SHOP_TABS.map(([k, l]) => `<button class="tab ${S.tab === k ? 'on' : ''}" data-act="shop-tab" data-v="${k}">${l}</button>`).join('')}</div>`;
  let body;
  if (S.tab === 'sell') {
    const list = sortItems(Object.keys(G.p.inventory).map(k => D.ITEMS[k]).filter(it => it && G.sellPrice(it.key) > 0 && match(S.q, it.name, it.cat, it.rarity)), 'rarity');
    body = `<div class="cards">${list.length ? list.map(it => {
      const n = G.inv(it.key), eq = G.p.equipped[it.cat] === it.key;
      return `<div class="card r-${it.rarity}" data-qwrap><div class="card-head"><span class="icon">${D.CAT_ICON[it.cat]}</span><div class="grow"><div class="name">${esc(it.name)}</div><div class="sub">${D.CAT_LABEL[it.cat]} · ${rarityTag(it.rarity)}</div></div><span class="count">×${fmt(n)}</span></div>
        <div class="desc">Sells for <b>$${fmt(G.sellPrice(it.key))}</b> each${eq ? ' · <span class="muted">equipped</span>' : ''}</div>
        <div class="card-actions">${eq && n <= 1 ? '<span class="muted small">Unequip to sell</span>' : `${qtyInput(n)}<button class="btn sm" data-act="sell" data-v="${it.key}">Sell</button><button class="btn sm ghost" data-act="sell-all" data-v="${it.key}">Sell all</button>`}</div></div>`;
    }).join('') : '<div class="empty-state">Nothing to sell.</div>'}</div>`;
  } else {
    let keys;
    if (S.tab === 'consumables') keys = D.SHOP_CONSUMABLES;
    else if (S.tab === 'pack') keys = Object.keys(D.PACK_PRICES);
    else keys = D.SHOP_KEYS[S.tab];
    const list = keys.map(k => D.ITEMS[k]).filter(it => match(S.q, it.name, it.stats, it.desc, it.rarity));
    body = `<div class="cards">${list.map(it => {
      const isEq = it.cat in G.p.equipped, owned = G.inv(it.key);
      const price = isEq ? it.price : (it.cat === 'pack' ? D.PACK_PRICES[it.key] : D.CONSUMABLE_PRICES[it.key]);
      const sp = isEq ? it.score_price : 0;
      const afford = u.money >= price && u.score >= sp;
      return `<div class="card r-${it.rarity}" data-qwrap><div class="card-head"><span class="icon">${D.CAT_ICON[it.cat]}</span><div class="grow"><div class="name">${esc(it.name)}</div><div class="sub">${D.CAT_LABEL[it.cat]} · ${rarityTag(it.rarity)}</div></div>${owned ? `<span class="count">×${fmt(owned)}</span>` : ''}</div>
        <div class="desc">${it.stats ? `<b>${esc(it.stats)}</b> ` : ''}${esc(it.desc)}</div>
        <div class="price ${afford ? '' : 'no'}">💰 $${fmt(price)}${sp ? ` · ⭐ ${fmt(sp)} score` : ''}</div>
        <div class="card-actions">${isEq ? (owned ? '<span class="chip good">✓ Owned</span>' : `<button class="btn sm primary" data-act="buy" data-v="${it.key}" ${afford ? '' : 'disabled'}>Buy</button>`)
          : `${qtyInput()}<button class="btn sm primary" data-act="buy" data-v="${it.key}" ${afford ? '' : 'disabled'}>Buy</button>`}</div></div>`;
    }).join('') || '<div class="empty-state">No items match.</div>'}</div>`;
  }
  return `<div class="page-head"><h2>🏪 Shop</h2><p class="muted">💰 $${fmt(u.money)} · ⭐ ${fmt(u.score)} score</p></div>${tabs}
    <div class="toolbar">${searchBox('shop-search', S.q, 'Search the shop…')}</div>${body}`;
}

// ---------- crafting ----------
const CRAFT_TABS = [['all', 'All'], ['consumables', '🧪 Potions'], ['upgrade', '💎 Upgrades'], ['weapon', '⚔️ Weapons'], ['armor', '🛡️ Armor'], ['wand', '🔱 Wands'], ['robe', '👘 Robes'], ['necklace', '📿 Necklaces']];
function renderCraft() {
  const C = UI.craft;
  const disc = G.derive().materialDiscount;
  let recipes = Object.keys(D.RECIPES).map(k => ({ k, r: D.RECIPES[k], it: D.ITEMS[D.RECIPES[k].result] })).filter(x => x.it);
  if (C.tab === 'consumables') recipes = recipes.filter(x => x.it.cat === 'potion' || x.it.cat === 'buff');
  else if (C.tab !== 'all') recipes = recipes.filter(x => x.it.cat === C.tab);
  recipes = recipes.filter(x => match(C.q, x.it.name, x.it.stats, ...Object.keys(x.r.materials).map(m => D.ITEMS[m] ? D.ITEMS[m].name : m)));
  if (C.only) recipes = recipes.filter(x => G.maxCraftable(x.k) > 0);
  recipes.sort((a, b) => (G.maxCraftable(b.k) > 0) - (G.maxCraftable(a.k) > 0) || D.RARITY_RANK[a.it.rarity] - D.RARITY_RANK[b.it.rarity]);
  return `<div class="page-head"><h2>⚒️ Crafting</h2><p class="muted">Turn monster materials into gear, potions and permanent upgrades.${disc ? ` Title discount: −${disc}% materials.` : ''}</p></div>
    <div class="tabs">${CRAFT_TABS.map(([k, l]) => `<button class="tab ${C.tab === k ? 'on' : ''}" data-act="craft-tab" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="toolbar">${searchBox('craft-search', C.q, 'Search recipes or materials…')}<label class="check"><input type="checkbox" data-act-change="craft-only" ${C.only ? 'checked' : ''}> Craftable only</label></div>
    <div class="cards">${recipes.map(({ k, r, it }) => {
      const need = G.recipeNeeds(k), max = G.maxCraftable(k);
      return `<div class="card r-${it.rarity} ${max ? '' : 'dim'}" data-qwrap><div class="card-head"><span class="icon">${D.CAT_ICON[it.cat]}</span><div class="grow"><div class="name">${esc(it.name)}</div><div class="sub">${D.CAT_LABEL[it.cat]} · ${rarityTag(it.rarity)}</div></div>${G.inv(it.key) ? `<span class="count">×${fmt(G.inv(it.key))}</span>` : ''}</div>
        <div class="desc">${it.stats ? `<b>${esc(it.stats)}</b> ` : ''}${esc(it.desc)}</div>
        <ul class="mats">${Object.entries(need).map(([m, q]) => { const have = G.inv(m); const mi = D.ITEMS[m]; return `<li class="${have >= q ? 'ok' : 'no'}"><span>${mi ? esc(mi.name) : esc(m)}</span><b>${fmt(have)} / ${q}</b></li>`; }).join('')}</ul>
        <div class="card-actions">${max ? `${qtyInput(max)}<button class="btn sm primary" data-act="craft" data-v="${k}">Craft</button><button class="btn sm ghost" data-act="craft-max" data-v="${k}">Max (${fmt(max)})</button>` : '<span class="muted small">Missing materials</span>'}</div></div>`;
    }).join('') || '<div class="empty-state">No recipes match.</div>'}</div>`;
}

// ---------- hero ----------
function renderHero() {
  const p = G.p, d = G.derive(), c = p.counters, pm = p.perm;
  const row = (l, v) => `<div><span>${l}</span><b>${v}</b></div>`;
  return `<div class="page-head"><h2>🧙 ${esc(G.displayName())}</h2><p class="muted">Level ${p.level} · Area ${p.area} · ${esc(G.displayTitle())}</p></div>
  <div class="grid-3">
    <section class="panel"><h3>Combat stats</h3><div class="statgrid">
      ${row('Max HP', fmt(d.hpMax))}${row('Max Mana', fmt(d.manaMax))}${row('ATK', fmt(d.atk))}${row('DEF', fmt(d.def))}
      ${row('Magic ATK', fmt(d.magicAtk))}${row('Magic DEF', fmt(d.magicDef))}${row('Crit chance', d.crit + '%')}${row('Mana regen', '+' + d.manaRegen + '/turn')}
      ${row('Lifesteal', `${d.lifestealFlat}% + ${d.lifestealPct}% @${d.lifestealChance}%`)}${row('EXP boost', '+' + fmt(d.expBoost) + '%')}
      ${row('EXP gain (perm)', '+' + fmt(d.expGain) + '%')}${row('EXP potion', '×' + fmt(d.expMult))}${row('Coin potion', '×' + fmt(d.coinMult))}
      ${row('Money boost', '+' + d.moneyBoost + '%')}${row('Dodges', p.dodge + '/' + p.max_dodge)}</div></section>
    <section class="panel"><h3>Base & permanent</h3><div class="statgrid">
      ${row('Base HP', fmt(p.base.hp_max))}${row('Base Mana', fmt(p.base.mana_max))}${row('Base ATK', fmt(p.base.atk))}${row('Base DEF', fmt(p.base.def))}
      ${row('Perm ATK', '+' + fmt(pm.atk))}${row('Perm DEF', '+' + fmt(pm.def))}${row('Perm HP', '+' + fmt(pm.hp))}${row('Perm Mana', '+' + fmt(pm.mana))}
      ${row('Perm MDEF', '+' + fmt(pm.magic_def))}${row('Perm Crit', '+' + pm.crit + '%')}</div>
      <h4>Buffs</h4><div class="chips">${buffChips(p)}</div></section>
    <section class="panel"><h3>Records</h3><div class="statgrid">
      ${row('Monsters slain', fmt(c.monsters_defeated))}${row('Bosses slain', fmt(c.bosses_defeated))}${row('Money earned', '$' + fmt(c.total_money_earned))}${row('Treasure found', '$' + fmt(c.dungeon_treasure_collected))}
      ${row('Items crafted', fmt(c.items_crafted))}${row('Materials', fmt(c.materials_collected))}${row('Critical hits', fmt(c.critical_hits))}${row('Deaths', fmt(c.times_died))}
      ${row('Spells learned', p.learned_spells.length + '/' + Object.keys(D.SPELLS_BY_KEY).length)}${row('Achievements', p.achievements.length + '/' + Object.keys(D.ACHIEVEMENTS).length)}</div></section>
  </div>
  <section class="panel"><h3>Equipped</h3>${equippedStrip()}</section>`;
}

// ---------- achievements ----------
function renderAchievements() {
  const p = G.p;
  return `<div class="page-head"><h2>🏆 Achievements</h2><p class="muted">${p.achievements.length} / ${Object.keys(D.ACHIEVEMENTS).length} unlocked. Each one grants a title.</p></div>
  <div class="cards">${Object.entries(D.ACHIEVEMENTS).map(([k, a]) => {
    const done = p.achievements.includes(k), pr = a.prog ? a.prog(p) : null;
    return `<div class="card ${done ? 'r-divine is-eq' : 'locked'}"><div class="card-head"><span class="icon">${done ? '🏆' : '🔒'}</span><div class="grow"><div class="name">${esc(a.name)}</div><div class="sub">Title: ${esc(a.title)}</div></div></div>
      <div class="desc">${esc(a.desc)}</div>${pr && !done ? bar(pr[0], pr[1], 'xp', `${fmt(pr[0])} / ${fmt(pr[1])}`) : ''}</div>`;
  }).join('')}</div>`;
}

// ---------- settings ----------
function renderSettings() {
  const s = G.p.settings;
  const all = s.auto_equip_everything;
  const tog = (k, l, desc, sub) => {
    const off = sub && all;   // covered by "auto-equip everything"
    return `<label class="toggle ${off ? 'disabled' : ''} ${sub ? 'sub' : ''}"><input type="checkbox" data-act-change="setting" data-v="${k}" ${s[k] && !off ? 'checked' : ''} ${off ? 'disabled' : ''}><span class="sw"></span><div><b>${l}</b><div class="muted small">${off ? 'Handled by “Auto-equip everything”.' : desc}</div></div></label>`;
  };
  return `<div class="page-head"><h2>⚙️ Settings</h2></div>
  <div class="grid-2">
    <section class="panel stack">
      <h3>Gameplay</h3>
      ${tog('show_exp_bar', 'Show EXP as percentage', 'Top bar shows % instead of raw numbers.')}
      ${tog('call_including_title', 'Call me by my title', 'Show your title before your name.')}
      ${tog('auto_equip_everything', 'Auto-equip everything', 'Gear, spells and titles are always kept at their best.')}
      ${tog('auto_equip_spells', 'Auto-equip spells', 'Equip your strongest spells after learning or leveling.', true)}
      ${tog('auto_equip_titles', 'Auto-equip titles', 'Equip your best titles when you unlock new ones.', true)}
      <button class="btn" data-act="goto-avatar">🎨 Customize avatar & profile</button>
      <label class="toggle"><input type="checkbox" data-act-change="remember" ${Store.data.remember === G.user.username ? 'checked' : ''}><span class="sw"></span><div><b>Remember me on this device</b><div class="muted small">Skip the login screen next time (replaces "home machine").</div></div></label>
    </section>
    <section class="panel stack">
      <h3>Account</h3>
      <form id="pw-form" class="stack"><label>Current password<input id="pw-old" type="password" autocomplete="current-password" required></label><label>New password<input id="pw-new" type="password" autocomplete="new-password" required></label><button class="btn" type="submit">Change password</button></form>
      <h3>Save data</h3>
      <p class="muted small">Progress is saved automatically in this browser. Export a backup to move it to another browser.</p>
      <div class="row"><button class="btn" data-act="export">⬇ Export save</button><button class="btn" data-act="import">⬆ Import save</button></div>
      <h3>Danger zone</h3>
      <button class="btn danger" data-act="delete-account">Delete account</button>
    </section>
  </div>`;
}

// ---------- debug console ----------
function openConsole() {
  if (!G.user) return;
  UI.console.open = true;
  if (G.user.username === 'tester01') UI.console.authed = true;
  renderConsole();
}
function renderConsole() {
  const C = UI.console;
  if (!C.authed) {
    modal('🔐 Restricted', `<form id="admin-form" class="stack"><label>When is the game developer's best friend's BOD?<input id="admin-q" autocomplete="off" required></label><button class="btn primary" type="submit">Submit</button></form>`);
    return;
  }
  const boot = !C.lines.length || (C.lines.length === 1 && C.lines[0] === 'Access Accepted');
  modal('🖥️ Debug console', `<div class="term" id="term">${C.lines.map(l => `<div class="${termCls(l)}">${esc(l)}</div>`).join('')}</div>
    <form id="term-form" class="term-in"><span>&gt;&gt;</span><input id="term-input" autocomplete="off" spellcheck="false" placeholder="type help  (Enter while printing skips the animation)"></form>`, { cls: 'wide' });
  const t = $('#term'); t.scrollTop = t.scrollHeight;
  if (boot) printSteps(['[BOOTSEQ://DEBUG_CONSOLE]', { wait: 300 }, '→ Linking subsystems...', { wait: 300 }, '→ Bypassing safety locks...', { wait: 300 }, '→ Syncing I/O...', { wait: 300 }, ':: DEBUG MODE ENGAGED ::', "Type 'help' for commands.", '']);
}
function termCls(l) {
  if (/^>> /.test(l)) return 'tc-cmd';
  if (/\[✓\]|SUCCESS REPORT|Access Accepted/.test(l)) return 'tc-ok';
  if (/\[✖\]|^!!|FAIL REPORT|^Unknown command|not found|^Invalid|^Usage/.test(l)) return 'tc-err';
  if (/^\[(SYS|BOOT|RESET|DELETE|CREATION|COLLECTION|SUCCESS|FAIL)|^:: /.test(l)) return 'tc-sys';
  if (/^\s*(>|→|•)/.test(l)) return 'tc-dim';
  return '';
}
function termAppend(text) {
  const C = UI.console;
  C.lines.push(text); if (C.lines.length > 600) C.lines.splice(0, C.lines.length - 600);
  const t = $('#term'); if (!t || !C.open) return null;
  const d = document.createElement('div'); d.className = termCls(text); d.textContent = text;
  t.appendChild(d); t.scrollTop = t.scrollHeight;
  return d;
}
/* prints Debug steps with little delays (Enter skips) */
async function printSteps(steps) {
  const C = UI.console;
  C.running = true; C.skip = false;
  const fast = () => C.skip || !Debug.anim || !C.open;
  for (const st of steps) {
    if (typeof st === 'string') { termAppend(st); if (!fast()) await sleep(randInt(12, 55)); }
    else if (st.wait) { if (!fast()) await sleep(st.wait); }
    else if (st.progress) {
      const el = termAppend(''); const idx = C.lines.length - 1;
      let cur = 0;
      while (cur < 100) {
        cur = Math.min(100, cur + randInt(5, 25));
        const f = Math.floor(cur / 10);
        const txt = cur < 100 ? `[${'■'.repeat(f)}${'□'.repeat(10 - f)}] ${st.progress} ${cur}%` : '[■■■■■■■■■■] 100% Done';
        C.lines[idx] = txt; if (el) el.textContent = txt;
        if (!fast()) await sleep(randInt(60, 220));
      }
    }
  }
  C.running = false;
  const inp = $('#term-input'); if (inp) inp.focus();
  render();
}
async function runTerm(line) {
  const C = UI.console;
  if (C.running) { C.skip = true; return; }
  termAppend('>> ' + line);
  if (line.trim()) { C.history.unshift(line); C.hIdx = -1; }
  const res = Debug.run(line);
  if (res === 'EXIT') { termAppend('Exiting debug console.'); await sleep(250); closeModal(); render(); return; }
  if (res === 'CLEAR') { C.lines = []; $('#term').innerHTML = ''; return; }
  render();   // data may have changed — refresh the game behind the console
  await printSteps(res);
}

// ================= EVENTS =================
const ACTIONS = {
  'auth-tab': el => { UI.authTab = el.dataset.v; UI.authMsg = ''; },
  continue: () => { if (G.loginRemembered()) { UI.page = 'dungeon'; toast(`Welcome back, ${G.user.username}!`, 'good'); } },
  logout: () => { G.logout(); UI.authMsg = ''; },
  nav: el => { UI.page = el.dataset.v; UI.fightPanel = 'main'; window.scrollTo(0, 0); },
  'goto-spells': () => { UI.page = 'inventory'; UI.inv.tab = 'spells'; UI.inv.q = ''; },
  // dungeon
  explore: () => { startExplore(); return false; },
  'end-fight': () => { if (!UI.busy) G.endFight(); },
  treasure: () => { if (UI.busy) return; const r = G.searchTreasure(); result(r); if (r.ambush) { startExplore(true); return false; } },
  rest: () => result(G.rest()),
  'area-step': el => result(G.setArea(G.p.area + Number(el.dataset.v))),
  fight: el => { const v = el.dataset.v; doFight(v, el.dataset.arg !== undefined ? (v === 'spell' ? Number(el.dataset.arg) : el.dataset.arg) : undefined); return false; },
  'fight-panel': el => { UI.fightPanel = UI.fightPanel === el.dataset.v ? 'main' : el.dataset.v; },
  // inventory
  'inv-tab': el => { UI.inv.tab = el.dataset.v; UI.inv.q = ''; },
  'inv-eq': el => { UI.inv.eq = el.dataset.v; },
  equip: el => result(G.equipItem(el.dataset.v)),
  unequip: el => { G.unequip(el.dataset.v); },
  'equip-best': el => { const b = G.bestEquipment(el.dataset.v); if (b) result(G.equipItem(b.key)); else toast(`No ${D.CAT_LABEL[el.dataset.v].toLowerCase()} owned.`, 'bad'); },
  'equip-best-all': () => { G.autoEquipItems(); G.save(); toast('Equipped your best gear.', 'good'); },
  use: el => result(G.useConsumable(el.dataset.v, qtyOf(el))),
  'use-all': el => result(G.useConsumable(el.dataset.v, G.inv(el.dataset.v))),
  'use-upgrade': el => result(G.useUpgrade(el.dataset.v, qtyOf(el))),
  'use-upgrade-all': el => result(G.useUpgrade(el.dataset.v, G.inv(el.dataset.v))),
  'use-all-upgrades': () => result(G.useAllUpgrades()),
  'open-pack': el => packResult(G.openPack(el.dataset.v, qtyOf(el))),
  'open-pack-all': el => packResult(G.openPack(el.dataset.v, G.inv(el.dataset.v))),
  'open-all-packs': () => { const r = G.openAllPacks(); if (!r.opened) toast('No packs to open.', 'bad'); else packResult(Object.assign(r, { ok: true })); },
  'spell-equip': el => result(G.equipSpell(el.dataset.v)),
  'spell-slot': el => result(G.equipSpell(el.dataset.v, Number(el.dataset.arg))),
  'spell-unequip': el => G.unequipSpell(Number(el.dataset.v)),
  'spell-auto': () => { G.autoEquipSpells(); toast('Equipped your best spells.', 'good'); },
  'spell-view': el => { UI.inv.spellView = el.dataset.v; },
  'title-equip': el => result(G.equipTitle(el.dataset.v)),
  'title-unequip': el => G.unequipTitle(Number(el.dataset.v)),
  'title-auto': () => { G.autoEquipTitles(); G.save(); toast('Equipped your best titles.', 'good'); },
  'clear-search': el => { const map = { 'inv-search': UI.inv, 'shop-search': UI.shop, 'craft-search': UI.craft }; map[el.dataset.v].q = ''; },
  // shop
  'shop-tab': el => { UI.shop.tab = el.dataset.v; UI.shop.q = ''; },
  buy: el => result(G.buy(el.dataset.v, qtyOf(el))),
  sell: el => result(G.sell(el.dataset.v, qtyOf(el))),
  'sell-all': el => { const k = el.dataset.v, it = D.ITEMS[k]; const n = G.inv(k) - (G.p.equipped[it.cat] === k ? 1 : 0); confirmModal('Sell all?', `Sell ${n}× ${esc(it.name)} for $${fmt(n * G.sellPrice(k))}?`, () => result(G.sell(k, n))); },
  // craft
  'craft-tab': el => { UI.craft.tab = el.dataset.v; },
  craft: el => result(G.craft(el.dataset.v, qtyOf(el))),
  'craft-max': el => result(G.craft(el.dataset.v, G.maxCraftable(el.dataset.v))),
  // arcade
  'guess-new': () => G.newGuess(),
  // settings
  export: () => {
    const blob = new Blob([G.exportSave()], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `dunes-intred-save-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  import: () => modal('Import save', `<p class="muted">This replaces ALL accounts in this browser with the file's contents.</p><input type="file" id="import-file" accept=".json,application/json"><div class="row end"><button class="btn primary" data-act="import-go">Import</button></div>`),
  'import-go': () => {
    const f = $('#import-file').files[0]; if (!f) return toast('Choose a file first.', 'bad');
    f.text().then(t => { try { G.importSave(t); closeModal(); toast('Save imported. Please log in.', 'good'); } catch (e) { toast('Import failed: ' + e.message, 'bad'); } render(); });
  },
  'delete-account': () => confirmModal('Delete account?', `This permanently deletes <b>${esc(G.user.username)}</b> and all progress.`, () => { G.deleteAccount(); toast('Account deleted.', 'info'); }, true),
  'modal-close': () => closeModal(),
  'modal-close-bg': (el, ev) => { if (ev.target === el) closeModal(); },
  'confirm-yes': () => { const fn = UI._confirm; closeModal(); if (fn) fn(); },
};
function packResult(r) {
  if (!r.ok) return toast(r.msg, 'bad');
  const names = r.learned.map(k => D.SPELLS_BY_KEY[k]);
  modal('📦 Magic pack opened', `${names.length ? `<p>You learned <b>${names.length}</b> new spell${names.length > 1 ? 's' : ''}:</p><div class="chips">${names.map(s => `<span class="chip r-${D.SPELL_RARITY[s.class]}">${D.ELEMENT_ICON[s.type] || '💠'} ${esc(s.name)}</span>`).join('')}</div>` : '<p>No new spells this time.</p>'}
    ${r.dups ? `<p class="muted">${r.dups} duplicate${r.dups > 1 ? 's' : ''} → refunded $${fmt(r.refund)}</p>` : ''}
    ${r.left ? `<p class="muted">Opened ${fmt(r.opened)} (limit ${fmt(BAL.USE_LIMIT)} per click) — ${fmt(r.left)} still unopened.</p>` : ''}
    <div class="row end">${names.length ? '<button class="btn" data-act="goto-spells-modal">Go to spells</button>' : ''}<button class="btn primary" data-act="modal-close">Nice!</button></div>`);
}
ACTIONS['goto-spells-modal'] = () => { closeModal(); ACTIONS['goto-spells'](); };

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  if (el.tagName === 'A') ev.preventDefault();
  if (fn(el, ev) !== false) render();
});
document.addEventListener('input', ev => {
  const el = ev.target, a = el.dataset.actInput;
  if (!a) return;
  if (a === 'inv-search') UI.inv.q = el.value;
  else if (a === 'shop-search') UI.shop.q = el.value;
  else if (a === 'craft-search') UI.craft.q = el.value;
  render();
});
document.addEventListener('change', ev => {
  const el = ev.target, a = el.dataset.actChange;
  if (!a) return;
  if (a === 'inv-sort') UI.inv.sort = el.value;
  else if (a === 'craft-only') UI.craft.only = el.checked;
  else if (a === 'remember') G.setRemember(el.checked);
  else if (a === 'area-range') result(G.setArea(Number(el.value)));
  else if (a === 'setting') {
    G.p.settings[el.dataset.v] = el.checked;
    if (el.checked) {
      if (el.dataset.v === 'auto_equip_spells') G.autoEquipSpells();
      if (el.dataset.v === 'auto_equip_titles') G.autoEquipTitles();
      if (el.dataset.v === 'auto_equip_everything') {
        G.p.settings.auto_equip_spells = false; G.p.settings.auto_equip_titles = false;   // everything supersedes them
        G.autoEquipItems(); G.autoEquipSpells(); G.autoEquipTitles();
        toast('Auto-equip everything is on — the other auto-equip options are now handled by it.', 'good');
      }
    }
    G.save();
  }
  render();
});
document.addEventListener('submit', ev => {
  const f = ev.target; ev.preventDefault();
  if (f.id === 'auth-form') {
    const u = $('#auth-user').value, pw = $('#auth-pass').value, rem = $('#auth-remember').checked;
    if (f.dataset.form === 'signup') {
      const r = G.signup(u, pw);
      if (!r.ok) { UI.authMsg = r.msg; return render(); }
      G.login(u, pw); UI.avatarDraft = randomAvatar(); toast('Hero created! Now create your look.', 'good');
    } else {
      const r = G.login(u, pw);
      if (!r.ok) { UI.authMsg = r.msg; return render(); }
      toast(`Welcome back, ${G.user.username}!`, 'good');
    }
    G.setRemember(rem); UI.authMsg = ''; UI.page = 'dungeon';
  } else if (f.id === 'pw-form') {
    result(G.changePassword($('#pw-old').value, $('#pw-new').value)); if (G.user) f.reset();
  } else if (f.id === 'guess-form') {
    const n = parseInt($('#guess-input').value, 10); if (n >= 1 && n <= 100) G.makeGuess(n);
  } else if (f.id === 'admin-form') {
    const ans = $('#admin-q').value.trim();
    if (ADMIN_ANSWERS.includes(ans)) { UI.console.authed = true; if (!UI.console.lines.length) UI.console.lines.push('Access Accepted'); renderConsole(); }
    else { closeModal(); toast('Access denied', 'bad'); }
    return;
  } else if (f.id === 'term-form') {
    const inp = $('#term-input'), line = inp.value;
    if (!UI.console.running) inp.value = '';
    runTerm(line);
    return;
  }
  render();
});

// keyboard: fight shortcuts + secret console code (type 10234, like the old menu option)
let secretBuf = '';
document.addEventListener('keydown', ev => {
  const tag = (ev.target.tagName || '').toLowerCase();
  if (ev.target.id === 'term-input' && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) {
    const C = UI.console; ev.preventDefault();
    C.hIdx = clamp(C.hIdx + (ev.key === 'ArrowUp' ? 1 : -1), -1, C.history.length - 1);
    ev.target.value = C.hIdx >= 0 ? C.history[C.hIdx] : '';
    return;
  }
  if (ev.key === 'Escape' && $('#modal-root').innerHTML) { closeModal(); render(); return; }
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (!G.user) return;
  secretBuf = (secretBuf + ev.key).slice(-5);
  if (secretBuf === '10234') { secretBuf = ''; openConsole(); return; }
  if ($('#modal-root').innerHTML || UI.page !== 'dungeon') return;
  const k = ev.key.toLowerCase(), f = G.fight;
  if (UI.busy) return;
  if (f && !f.over) {
    const map = { a: 'attack', d: 'dodge', r: 'run' };
    if (map[k]) { ev.preventDefault(); doFight(map[k]); return; }
    if (k === 'm') UI.fightPanel = UI.fightPanel === 'magic' ? 'main' : 'magic';
    else if (k === 'p') UI.fightPanel = UI.fightPanel === 'items' ? 'main' : 'items';
    else if (/^[1-4]$/.test(k)) { const i = Number(k) - 1, s = D.SPELLS_BY_KEY[G.p.equipped_spells[i]]; if (s && G.p.mana >= s.mana) { ev.preventDefault(); doFight('spell', i); } return; }
    else return;
    ev.preventDefault(); render();
  } else if (k === 'e') { ACTIONS.explore(); }
});

