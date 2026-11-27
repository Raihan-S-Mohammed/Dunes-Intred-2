"use strict";
/* Profiles, avatar creator, trading, notifications, leaderboard. Loaded after ui.js. */

Object.assign(UI, {
  profileName: null,                 // null = my own profile
  playerQ: '',
  avatarDraft: null,
  lbType: 'score',
  notifOpen: false,
  trade: { tab: 'new', to: '', give: {}, want: {}, giveMoney: 0, wantMoney: 0, note: '', qGive: '', qWant: '' },
});

const timeAgo = t => {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`;
};
const miniAv = (u, size = 28) => `<span class="mini-av">${avatarSVG(u && u.avatar, size)}</span>`;

// ---------- notifications (bell dropdown) ----------
function renderNotifPanel() {
  const list = G.myNotifications();
  return `<div class="notif-panel" role="dialog" aria-label="Notifications">
    <div class="notif-head"><b>Notifications</b><span class="push"></span>
      <button class="btn sm ghost" data-act="notif-clear" ${list.length ? '' : 'disabled'}>Clear</button></div>
    <div class="notif-list">${list.length ? list.slice(0, 40).map(n => `<button class="notif ${n.read ? '' : 'unread'}" data-act="notif-open" data-v="${n.id}">
      <span class="n-ic">${n.kind === 'trade' ? '🤝' : '🔔'}</span><span class="grow">${esc(n.text)}<small>${timeAgo(n.time)}</small></span></button>`).join('') : '<div class="muted center pad">No notifications yet.</div>'}</div></div>`;
}

// ---------- avatar creator ----------
function renderAvatarPage(onboarding) {
  if (!UI.avatarDraft) UI.avatarDraft = Object.assign(defaultAvatar(), G.user.avatar || randomAvatar());
  const a = UI.avatarDraft;
  const rows = Object.entries(AVATAR_OPTS).map(([k, o]) => {
    const opts = o.values.map(v => {
      const on = a[k] === v;
      if (o.type === 'color') return `<button class="swatch ${on ? 'on' : ''}" style="background:${v}" data-act="av-set" data-k="${k}" data-v="${v}" aria-label="${o.label} ${v}"></button>`;
      const preview = avatarSVG(Object.assign({}, a, { [k]: v }), 46);
      return `<button class="av-opt ${on ? 'on' : ''}" data-act="av-set" data-k="${k}" data-v="${v}" title="${esc(v)}">${preview}<small>${esc(v)}</small></button>`;
    }).join('');
    return `<div class="av-row"><h4>${o.label}</h4><div class="av-opts ${o.type}">${opts}</div></div>`;
  }).join('');
  const body = `<div class="av-editor">
    <div class="av-preview panel"><div class="big-av">${avatarSVG(a, 200)}</div>
      <b class="center">${esc(G.user.username)}</b>
      <div class="row center wrap"><button class="btn" data-act="av-random">🎲 Randomize</button>${onboarding ? '' : '<button class="btn ghost" data-act="av-cancel">Cancel</button>'}</div>
      <button class="btn primary wide" data-act="av-save">${onboarding ? 'Start adventure →' : 'Save avatar'}</button></div>
    <div class="av-controls panel">${rows}</div></div>`;
  if (onboarding) return `<div class="onboard"><div class="logo big">⚔️ The Dunes Intred</div><h2 class="center">Create your look</h2><p class="muted center">Your avatar appears on your profile, the leaderboard and trades. You can change it any time from Profile or Settings.</p>${body}</div>`;
  return `<div class="page-head"><h2>🎨 Customize avatar</h2></div>${body}`;
}

// ---------- profile ----------
function renderProfile() {
  const name = UI.profileName || G.user.username;
  const pr = G.profileOf(name);
  if (!pr) { UI.profileName = null; return renderProfile(); }
  const { u, p, d } = pr, mine = u === G.user;
  const slot = (cat) => { const k = p.equipped[cat], it = k && D.ITEMS[k]; return `<div class="eq-slot ${it ? 'r-' + it.rarity : 'empty'}"><span class="icon">${D.CAT_ICON[cat]}</span><div class="grow"><div class="sub">${D.CAT_LABEL[cat]}</div><div class="name">${it ? esc(it.name) : 'Empty'}</div>${it ? `<div class="small muted">${esc(it.stats)}</div>` : ''}</div></div>`; };
  const itemTile = (it, pin) => `<div class="tile r-${it.rarity}" title="${esc(it.desc)}"><span class="icon">${D.CAT_ICON[it.cat]}</span><b>${esc(it.name)}</b><small>${rarityTag(it.rarity)} · ×${fmt(p.inventory[it.key] || 0)}</small>${pin && mine ? `<button class="icon-btn pin-x" data-act="showcase" data-v="${it.key}" title="Unpin">✕</button>` : ''}</div>`;
  const ranks = Object.entries(pr.ranks).map(([t, r]) => `<span class="chip" title="${esc(G.LB_TYPES[t].what)}">#${r} ${G.LB_TYPES[t].label}</span>`).join('');
  const players = G.otherPlayers().concat(mine ? [] : [G.user.username]).filter(n => n !== name && match(UI.playerQ, n));
  return `<div class="profile">
    <section class="pf-banner" style="--banner:${esc(u.profile.banner)}">
      <div class="pf-av">${avatarSVG(u.avatar, 128)}</div>
      <div class="pf-id grow"><div class="pf-title">${esc(pr.title)}</div><h2>${esc(u.username)} ${mine ? '<span class="chip">you</span>' : ''}</h2>
        <div class="pf-meta">Level <b>${fmt(p.level)}</b> · Area ${p.area} · Power <b>${fmt(pr.power)}</b> · Score ${fmt(u.score)} · Joined ${new Date(u.created || Date.now()).toLocaleDateString()}</div>
        <div class="chips">${ranks}</div></div>
      <div class="pf-actions">${mine ? `<button class="btn" data-act="goto-avatar">🎨 Customize avatar</button><button class="btn ghost" data-act="edit-profile">✏️ Edit profile</button>`
        : `<button class="btn primary" data-act="trade-with" data-v="${esc(u.username)}">🤝 Propose trade</button><button class="btn ghost" data-act="profile-me">My profile</button>`}</div>
    </section>
    ${u.profile.bio ? `<p class="pf-bio">“${esc(u.profile.bio)}”</p>` : mine ? '<p class="muted pf-bio">No bio yet — click “Edit profile” to add one.</p>' : ''}
    <div class="grid-2">
      <section class="panel"><h3>Equipped</h3><div class="pf-eq">${['weapon', 'armor', 'wand', 'robe', 'necklace'].map(slot).join('')}</div>
        <h4>Spells</h4><div class="chips">${p.equipped_spells.map((k, i) => k ? `<span class="chip r-${D.SPELL_RARITY[D.SPELLS_BY_KEY[k].class]}">${D.ELEMENT_ICON[D.SPELLS_BY_KEY[k].type] || '💠'} ${esc(D.SPELLS_BY_KEY[k].name)}</span>` : `<span class="chip empty">${i + 1}. empty</span>`).join('')}</div>
        <h4>Titles</h4><div class="chips">${p.equipped_titles.map(k => k ? `<span class="chip r-${D.TITLES[k].rarity}">👑 <span class="rar rar-${D.TITLES[k].rarity}">${esc(D.TITLES[k].name)}</span></span>` : '<span class="chip empty">empty</span>').join('')}</div></section>
      <section class="panel"><h3>Stats</h3><div class="statgrid">
        <div><span>Max HP</span><b>${fmt(d.hpMax)}</b></div><div><span>Max Mana</span><b>${fmt(d.manaMax)}</b></div>
        <div><span>ATK</span><b>${fmt(d.atk)}</b></div><div><span>DEF</span><b>${fmt(d.def)}</b></div>
        <div><span>Magic ATK</span><b>${fmt(d.magicAtk)}</b></div><div><span>Magic DEF</span><b>${fmt(d.magicDef)}</b></div>
        <div><span>Crit</span><b>${d.crit}%</b></div><div><span>EXP bonus</span><b>+${fmt(d.expBoost)}% · +${fmt(d.expGain)}%</b></div>
        <div><span>Monsters</span><b>${fmt(p.counters.monsters_defeated)}</b></div><div><span>Bosses</span><b>${fmt(p.counters.bosses_defeated)}</b></div>
        <div><span>Spells learned</span><b>${p.learned_spells.length}/${Object.keys(D.SPELLS_BY_KEY).length}</b></div><div><span>Titles</span><b>${p.titles.length}/${Object.keys(D.TITLES).length}</b></div></div></section>
    </div>
    <section class="panel"><div class="row"><h3>⭐ Showcase</h3><span class="muted small push">${mine ? 'Pin up to 6 items with ☆ in your Inventory.' : ''}</span></div>
      <div class="tiles">${pr.showcase.map(it => itemTile(it, true)).join('')}${Array.from({ length: Math.max(0, 6 - pr.showcase.length) }, () => '<div class="tile empty">empty</div>').join('')}</div></section>
    <section class="panel"><h3>💎 Best items</h3><div class="tiles">${pr.best.length ? pr.best.map(it => itemTile(it)).join('') : '<p class="muted">No items yet.</p>'}</div></section>
    <section class="panel"><h3>🏆 Achievements (${p.achievements.length}/${Object.keys(D.ACHIEVEMENTS).length})</h3>
      <div class="chips">${Object.entries(D.ACHIEVEMENTS).map(([k, a]) => `<span class="chip ${p.achievements.includes(k) ? 'good' : 'empty'}" title="${esc(a.desc)}">${p.achievements.includes(k) ? '🏆' : '🔒'} ${esc(a.name)}</span>`).join('')}</div></section>
    <section class="panel"><h3>👥 Players</h3>${searchBox('player-search', UI.playerQ, 'Find a player…')}
      <div class="player-list">${players.length ? players.map(n => { const o = Store.data.users[n]; return `<button class="player-btn" data-act="view-profile" data-v="${esc(n)}">${miniAv(o, 36)}<span class="grow"><b>${esc(n)}</b><small>${esc(G.displayTitle(o.player))} · Lv ${fmt(o.player.level)}</small></span></button>`; }).join('') : '<p class="muted">No other players on this device yet. Anyone can create an account on the login screen.</p>'}</div></section>
  </div>`;
}
function editProfileModal() {
  const pr = G.user.profile;
  const banners = ['#2b3a67', '#4a2a5e', '#5e2a2a', '#22543d', '#5e4a1e', '#1e4e5e', '#333845', '#6b1b4a'];
  modal('✏️ Edit profile', `<form id="profile-form" class="stack">
    <label>Bio (max 240 characters)<textarea id="pf-bio" maxlength="240" rows="3">${esc(pr.bio)}</textarea></label>
    <div><h4>Banner colour</h4><div class="av-opts color">${banners.map(c => `<label class="swatch-radio"><input type="radio" name="banner" value="${c}" ${pr.banner === c ? 'checked' : ''}><span class="swatch" style="background:${c}"></span></label>`).join('')}</div></div>
    <div class="row end"><button type="button" class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`);
}

// ---------- trades ----------
function bundleChips(b, editable, side) {
  const chips = Object.entries(b.items).map(([k, q]) => { const it = D.ITEMS[k]; return `<span class="chip r-${it ? it.rarity : 'common'}">${it ? D.CAT_ICON[it.cat] : ''} ${esc(it ? it.name : k)} ×${fmt(q)}${editable ? ` <button class="icon-btn" data-act="trade-remove" data-side="${side}" data-v="${k}" aria-label="Remove">✕</button>` : ''}</span>`; });
  if (b.money) chips.push(`<span class="chip">💰 $${fmt(b.money)}</span>`);
  return chips.join('') || '<span class="muted small">nothing</span>';
}
function pickList(user, side, q, chosen) {
  const list = G.tradableList(user).filter(it => match(q, it.name, it.cat, it.rarity)).sort((a, b) => D.RARITY_RANK[b.rarity] - D.RARITY_RANK[a.rarity] || a.name.localeCompare(b.name));
  return `<div class="pick-list">${list.length ? list.map(it => {
    const avail = G.tradable(user, it.key) - (chosen[it.key] || 0);
    return `<div class="pick-row r-${it.rarity}" data-qwrap><span class="icon">${D.CAT_ICON[it.cat]}</span><span class="grow"><b>${esc(it.name)}</b><small>${rarityTag(it.rarity)} · ${fmt(avail)} available</small></span>
      ${avail > 0 ? `${qtyInput(avail)}<button class="btn sm" data-act="trade-add" data-side="${side}" data-v="${it.key}">Add</button>` : '<span class="muted small">all added</span>'}</div>`;
  }).join('') : `<div class="muted pad">${q ? 'No matches.' : 'Nothing tradable.'}</div>`}</div>`;
}
function tradeCard(t) {
  const me = G.user.username, incoming = t.to === me;
  const other = incoming ? t.from : t.to;
  const youGive = incoming ? t.want : t.give, youGet = incoming ? t.give : t.want;
  let warn = '';
  if (t.status === 'pending') {
    const from = Store.data.users[t.from], to = Store.data.users[t.to];
    const prob = !from || !to ? 'The other player no longer exists.' : (G.bundleProblem(from, t.give, t.from) || G.bundleProblem(to, t.want, t.to));
    if (prob) warn = `<div class="warn">⚠️ ${esc(prob)} — accepting will fail.</div>`;
  }
  const status = { pending: '⏳ Pending', accepted: '✅ Accepted', declined: '❌ Declined', cancelled: '🚫 Cancelled', failed: '⚠️ Failed' }[t.status];
  return `<div class="trade-card st-${t.status}">
    <div class="row"><button class="player-btn inline" data-act="view-profile" data-v="${esc(other)}">${miniAv(Store.data.users[other])}<b>${esc(other)}</b></button>
      <span class="muted small">${incoming ? 'sent you an offer' : 'offer sent'} · ${timeAgo(t.created)}</span><span class="chip push">${status}</span></div>
    <div class="trade-sides"><div><h4>You give</h4><div class="chips">${bundleChips(youGive)}</div></div><div class="arrow">⇄</div><div><h4>You get</h4><div class="chips">${bundleChips(youGet)}</div></div></div>
    ${t.note ? `<p class="muted small">“${esc(t.note)}”</p>` : ''}${t.reason ? `<div class="warn">${esc(t.reason)}</div>` : ''}${warn}
    ${t.status === 'pending' ? `<div class="row end">${incoming ? `<button class="btn ghost" data-act="trade-decline" data-v="${t.id}">Decline</button><button class="btn primary" data-act="trade-accept" data-v="${t.id}">Accept trade</button>` : `<button class="btn ghost" data-act="trade-cancel" data-v="${t.id}">Cancel offer</button>`}</div>` : ''}
  </div>`;
}
function renderTrades() {
  const T = UI.trade, me = G.user.username;
  const all = G.tradesFor(me);
  const inc = all.filter(t => t.status === 'pending' && t.to === me), out = all.filter(t => t.status === 'pending' && t.from === me), hist = all.filter(t => t.status !== 'pending');
  const tabs = [['new', '➕ New offer'], ['incoming', `📥 Incoming<em>${inc.length}</em>`], ['outgoing', `📤 Outgoing<em>${out.length}</em>`], ['history', `📜 History<em>${hist.length}</em>`]];
  let body;
  if (T.tab === 'new') {
    const others = G.otherPlayers();
    if (!others.length) body = `<div class="empty-state">No other players on this device yet.<br>Create another account from the login screen to trade with it.</div>`;
    else {
      if (!others.includes(T.to)) T.to = others[0];
      const them = Store.data.users[T.to];
      const give = { items: T.give, money: T.giveMoney }, want = { items: T.want, money: T.wantMoney };
      body = `<div class="panel slim row wrap"><label class="row">Trade with
        <select id="trade-to" data-act-change="trade-to">${others.map(n => `<option ${n === T.to ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <button class="player-btn inline" data-act="view-profile" data-v="${esc(T.to)}">${miniAv(them)}<span><b>${esc(T.to)}</b> <small>Lv ${fmt(them.player.level)} · view profile</small></span></button>
        <span class="muted small push">Equipped items can't be traded (unequip them first).</span></div>
      <div class="grid-2 trade-build">
        <section class="panel"><h3>You give</h3><div class="chips">${bundleChips(give, true, 'give')}</div>
          <label class="row money-row">💰 Money <input id="trade-gm" type="number" min="0" max="${G.user.money}" value="${T.giveMoney || ''}" placeholder="0" data-act-input="trade-gm"><small class="muted">you have $${fmt(G.user.money)}</small></label>
          ${searchBox('trade-qgive', T.qGive, 'Search your items…')}${pickList(G.user, 'give', T.qGive, T.give)}</section>
        <section class="panel"><h3>You want from ${esc(T.to)}</h3><div class="chips">${bundleChips(want, true, 'want')}</div>
          <label class="row money-row">💰 Money <input id="trade-wm" type="number" min="0" value="${T.wantMoney || ''}" placeholder="0" data-act-input="trade-wm"><small class="muted">they have $${fmt(them.money)}</small></label>
          ${searchBox('trade-qwant', T.qWant, `Search ${esc(T.to)}'s items…`)}${pickList(them, 'want', T.qWant, T.want)}</section>
      </div>
      <section class="panel row wrap"><input id="trade-note" class="grow" maxlength="140" placeholder="Optional message (max 140)" value="${esc(T.note)}" data-act-input="trade-note">
        <button class="btn ghost" data-act="trade-reset">Clear</button><button class="btn primary" data-act="trade-send">📨 Send offer</button></section>`;
    }
  } else {
    const list = T.tab === 'incoming' ? inc : T.tab === 'outgoing' ? out : hist;
    body = list.length ? `<div class="trade-list">${list.map(tradeCard).join('')}</div>` : `<div class="empty-state">${T.tab === 'incoming' ? 'No incoming offers.' : T.tab === 'outgoing' ? 'No pending offers sent.' : 'No finished trades yet.'}</div>`;
  }
  return `<div class="page-head"><h2>🤝 Trades</h2><p class="muted">Offer any items or money to another player. They accept or decline. Both sides are re-checked when accepted, so nothing can be duplicated.</p></div>
    <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${T.tab === k ? 'on' : ''}" data-act="trade-tab" data-v="${k}">${l}</button>`).join('')}</div>${body}`;
}

// ---------- leaderboard ----------
function renderLeaderboard() {
  const type = UI.lbType, t = G.LB_TYPES[type];
  const lb = G.leaderboard(type, 50), g = G.guess;
  const val = r => type === 'level' ? fmt(r.level) : type === 'money' ? '$' + fmt(r.value) : fmt(r.value);
  return `<div class="page-head"><h2>📜 Leaderboard</h2></div>
  <div class="tabs">${Object.entries(G.LB_TYPES).map(([k, x]) => `<button class="tab ${type === k ? 'on' : ''}" data-act="lb-type" data-v="${k}">${x.label}</button>`).join('')}</div>
  <div class="lb-explain panel slim"><b>Ranked by ${esc(t.label)}:</b> ${esc(t.what)} <span class="muted">Showing all players on this device. Click a player to view their profile.</span></div>
  <div class="grid-2">
    <section class="panel"><div class="lb-table">
      <div class="lb-row head"><span>#</span><span>Player</span><span>Level</span><span>${esc(t.label)}</span></div>
      ${lb.map((r, i) => `<button class="lb-row ${r.name === G.user.username ? 'me' : ''}" data-act="view-profile" data-v="${esc(r.name)}"><span class="rank">${['🥇', '🥈', '🥉'][i] || i + 1}</span>
        <span class="lb-player">${miniAv(r)}<span><b>${esc(r.name)}</b><small>${esc(r.title)}</small></span></span><span>${fmt(r.level)}</span><b class="lb-val">${val(r)}</b></button>`).join('')}
    </div></section>
    <section class="panel"><h3>🎲 Number Guessing Game</h3><p class="muted">Guess the number between 1 and 100. Fewer attempts = more score (10 − attempts).</p>
      ${!g || g.done ? `<button class="btn primary" data-act="guess-new">${g ? 'Play again' : 'Start game'}</button>` : `<form id="guess-form" class="row"><input id="guess-input" type="number" min="1" max="100" placeholder="1–100" required><button class="btn primary" type="submit">Guess</button></form><p class="muted">Attempts: ${g.attempts}</p>`}
      ${g ? `<ul class="guess-hist">${g.history.map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}</section>
  </div>`;
}

// ---------- actions ----------
Object.assign(ACTIONS, {
  'bell': () => { UI.notifOpen = !UI.notifOpen; if (UI.notifOpen) setTimeout(() => { G.markAllRead(); }, 50); },
  'notif-clear': () => G.clearNotifications(),
  'notif-open': el => { const n = G.myNotifications().find(x => x.id === el.dataset.v); UI.notifOpen = false; if (n && n.tradeId) { const t = Store.data.trades[n.tradeId]; UI.page = 'trades'; UI.trade.tab = t && t.status === 'pending' ? (t.to === G.user.username ? 'incoming' : 'outgoing') : 'history'; } },
  'view-profile': el => { UI.profileName = el.dataset.v === G.user.username ? null : el.dataset.v; UI.page = 'profile'; window.scrollTo(0, 0); },
  'profile-me': () => { UI.profileName = null; },
  'goto-avatar': () => { UI.avatarDraft = null; UI.page = 'avatar'; },
  'edit-profile': () => { editProfileModal(); return false; },
  'showcase': el => result(G.toggleShowcase(el.dataset.v)),
  'av-set': el => { UI.avatarDraft[el.dataset.k] = el.dataset.v; },
  'av-random': () => { UI.avatarDraft = randomAvatar(); },
  'av-cancel': () => { UI.avatarDraft = null; UI.page = 'profile'; },
  'av-save': () => { const first = !G.user.avatar; G.setAvatar(UI.avatarDraft); UI.avatarDraft = null; toast(first ? 'Looking good! Welcome to the Dunes.' : 'Avatar saved.', 'good'); UI.page = first ? 'dungeon' : 'profile'; UI.profileName = null; },
  'lb-type': el => { UI.lbType = el.dataset.v; },
  'trade-tab': el => { UI.trade.tab = el.dataset.v; },
  'trade-with': el => { Object.assign(UI.trade, { tab: 'new', to: el.dataset.v, give: {}, want: {}, giveMoney: 0, wantMoney: 0, note: '' }); UI.page = 'trades'; },
  'trade-add': el => { const side = el.dataset.side, k = el.dataset.v, b = UI.trade[side]; b[k] = (b[k] || 0) + qtyOf(el); },
  'trade-remove': el => { delete UI.trade[el.dataset.side][el.dataset.v]; },
  'trade-reset': () => Object.assign(UI.trade, { give: {}, want: {}, giveMoney: 0, wantMoney: 0, note: '' }),
  'trade-send': () => {
    const T = UI.trade;
    const r = G.createTrade(T.to, { items: T.give, money: T.giveMoney }, { items: T.want, money: T.wantMoney }, T.note);
    result(r);
    if (r.ok) { Object.assign(T, { give: {}, want: {}, giveMoney: 0, wantMoney: 0, note: '', tab: 'outgoing' }); }
  },
  'trade-accept': el => result(G.respondTrade(el.dataset.v, true)),
  'trade-decline': el => result(G.respondTrade(el.dataset.v, false)),
  'trade-cancel': el => result(G.cancelTrade(el.dataset.v)),
});
document.addEventListener('input', ev => {
  const a = ev.target.dataset.actInput; if (!a) return;
  const T = UI.trade, v = ev.target.value;
  if (a === 'trade-gm') T.giveMoney = Math.max(0, Math.floor(Number(v) || 0));
  else if (a === 'trade-wm') T.wantMoney = Math.max(0, Math.floor(Number(v) || 0));
  else if (a === 'trade-note') { T.note = v; return; }       // no re-render needed
  else if (a === 'trade-qgive') T.qGive = v;
  else if (a === 'trade-qwant') T.qWant = v;
  else if (a === 'player-search') UI.playerQ = v;
  else return;
  render();
});
document.addEventListener('change', ev => {
  if (ev.target.dataset.actChange === 'trade-to') { Object.assign(UI.trade, { to: ev.target.value, want: {}, wantMoney: 0, qWant: '' }); render(); }
});
document.addEventListener('submit', ev => {
  if (ev.target.id !== 'profile-form') return;
  const banner = (document.querySelector('input[name=banner]:checked') || {}).value;
  G.setProfile({ bio: $('#pf-bio').value, banner }); closeModal(); toast('Profile saved.', 'good'); render();
});
// close the bell panel when clicking elsewhere
document.addEventListener('click', ev => {
  if (UI.notifOpen && !ev.target.closest('.notif-panel') && !ev.target.closest('[data-act=bell]')) { UI.notifOpen = false; render(); }
}, true);

// live sync between browser tabs (e.g. two accounts open side by side)
window.addEventListener('storage', ev => {
  if (ev.key !== SAVE_KEY || !ev.newValue) return;
  const name = G.user && G.user.username, before = G.unreadCount();
  try { Store.data = JSON.parse(ev.newValue); } catch (e) { return; }
  Store.load(true);
  if (name) {
    G.user = Store.data.users[name] || null;
    if (!G.user) { G.fight = null; toast('Your account was removed in another tab.', 'bad'); }
    else if (G.unreadCount() > before) { const n = G.myNotifications()[0]; toast(n ? n.text : 'New notification', 'info'); }
  }
  render();
});
