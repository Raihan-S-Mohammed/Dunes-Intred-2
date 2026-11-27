"use strict";
/* Debug console — port of debug_console() from fullcode.py, including its
   fake "system" animations. Commands accept both styles:
       ruinthefun raider        ruinthefun(raider)
       setmoney raider 500      setmoney(raider, 500)
   Debug.run(line) returns a list of steps the UI prints with small delays:
     'text'                 a line
     { wait: ms }           pause
     { progress: 'label' }  animated [■■■□□] bar
*/
const ADMIN_ANSWERS = ['31,10,2011', '31\b\x811', '31/10/2011', '31.10.2011', '31-10-2011'];
const UPGRADE_ALIASES = {
  str: 'perm_strength_upgrade', def: 'perm_defense_upgrade', hp: 'perm_health_upgrade', mana: 'perm_mana_upgrade', crit: 'perm_crit_chance_upgrade',
  magic_def: 'perm_magic_def_upgrade', lifesteal: 'perm_lifesteal_upgrade', lifesteal_chance: 'perm_lifesteal_chance_upgrade', exp: 'perm_exp_upgrade',
  perm_str: 'perm_strength_upgrade', perm_def: 'perm_defense_upgrade', perm_hp: 'perm_health_upgrade', perm_mana: 'perm_mana_upgrade', perm_crit: 'perm_crit_chance_upgrade',
  perm_magic_def: 'perm_magic_def_upgrade', perm_lifesteal: 'perm_lifesteal_upgrade', perm_lifesteal_chance: 'perm_lifesteal_chance_upgrade', perm_exp: 'perm_exp_upgrade',
  exp_gain: 'perm_exp_gain_upgrade', perm_exp_gain: 'perm_exp_gain_upgrade',
};
// python stat names (from the original stats dict) -> path in the new player object
const STAT_MAP = {
  hp: ['hp'], mana: ['mana'], level: ['level'], exp: ['exp'], dodge_points: ['dodge'], dodge: ['dodge'], max_dodge: ['max_dodge'], current_area: ['area'], area: ['area'],
  hp_max: ['base', 'hp_max'], mana_max: ['base', 'mana_max'], atk: ['base', 'atk'], defense: ['base', 'def'], def: ['base', 'def'],
  perm_atk: ['perm', 'atk'], perm_def: ['perm', 'def'], perm_hp_max: ['perm', 'hp'], perm_mana_max: ['perm', 'mana'], perm_magic_def: ['perm', 'magic_def'],
  perm_crit_chance: ['perm', 'crit'], perm_mana_regen: ['perm', 'mana_regen'], perm_lifesteal: ['perm', 'lifesteal'], perm_lifesteal_chance: ['perm', 'lifesteal_chance'], perm_exp_boost: ['perm', 'exp'], perm_exp_gain: ['perm', 'exp_gain'],
};
const EXIT_WORDS = ['exit', '.', 'dilsaf', 'get out', 'getout', 'out', 'quit'];

const Debug = {
  anim: true,
  guess: null,   // in-console guessing game ('play')

  helpLines() {
    return [
      '', '--- Debug Commands ---',
      'users                          - display all registered users (limited info)',
      'current                        - display current user and score',
      'numbers                        - display generated random numbers (if any)',
      'play                           - play the number guessing game',
      'adduser <u> <p>                - create a new user account with password',
      'deluser <u>                    - delete a user account',
      'reset                          - reset all users and highscores',
      'resetplayer <u>                - reset a single user to default stats',
      'setdmoney <n>                  - set dungeon treasure amount to n',
      "setscore <u> <n>               - set a user's score to n",
      "setmoney <u> <n>               - set a user's money to n",
      "setexp <u> <n>                 - set a user's experience to n",
      "setlvl <u> <n>                 - set a user's level to n",
      'setdefeated <u> <type> <n>     - set defeated count (monsters, bosses)',
      "set <u> <stat> <n>             - set a user's stat (hp, hp_max, atk, defense, mana, perm_atk ...)",
      'showfull <u>                   - display full data for user u',
      'give <u> <item> [qty]          - grant an item (aliases: str, def, hp, mana, crit, exp ...)',
      'ruinthefun(username)           - grant all achievements, items (500x usable), max stats',
      "setdodge <u> <n>               - set a user's dodge points to n",
      'exit                           - close debug console',
      '', '--- Extras ---',
      'spawn boss|normal <alias>      - force the next monster (old "explore 10234 b gk")',
      'monsters                       - list monster aliases',
      'items [filter]                 - list item keys for give',
      'anim on|off                    - toggle the fake system animations',
      'clear                          - clear the screen',
      'All commands also work as name(arg1, arg2), e.g. setmoney(raider, 500)',
      '-----------------------', '',
    ];
  },

  parse(line) {
    let s = line.trim();
    const fn = /^([a-z_]+)\s*\((.*)\)\s*$/i.exec(s);
    if (fn) return { cmd: fn[1].toLowerCase(), args: fn[2].split(/[\s,]+/).map(x => x.replace(/^["']|["']$/g, '')).filter(Boolean) };
    const parts = s.split(/\s+/);
    return { cmd: (parts[0] || '').toLowerCase(), args: parts.slice(1) };
  },

  // ---------- fake system animations (ported) ----------
  r(a, b) { return this.anim ? randInt(a, b) : 0; },
  simExec(command, success) {
    const st = ['', '[SYS://CMD_EXECUTE]', 'Operation request received.', `Command → ${command}`];
    const w = () => st.push({ wait: this.r(60, 220) });
    for (const s of sample(['Initializing execution layer...', 'Linking runtime channels...', 'Dispatching opcode...', 'Allocating resources...', 'Establishing secure connection...', 'Loading command modules...', 'Verifying command syntax...', 'Preparing execution environment...', 'Synchronizing subsystems...', 'Activating protocol handler...'], 3)) { st.push('> ' + s); w(); }
    const mod = `/core/${command.replace(/\./g, '/').replace(/ /g, '_')}.axl`;
    if (success) {
      for (const s of sample(['Validating instruction set...', 'Performing integrity checks...', 'Scanning for anomalies...', 'Executing safety protocols...', 'Confirming resource availability...'], randInt(2, 4))) { st.push('> ' + s); w(); }
      st.push('> All checks passed.', '> No anomalies detected.', '> Executing protected routine...', '', '[SUCCESS REPORT]',
        ` • CODE        : 0x${randInt(0, 255).toString(16).toUpperCase().padStart(2, '0')}-OK`, ` • MODULE      : ${mod}`,
        ` • RESULT      : ${choice(['Operation completed', 'Task executed', 'Command processed', 'Routine finished', 'Action successful'])}`,
        ` • STATUS      : ${choice(['Stable', 'Nominal', 'Operational', 'Secure', 'Verified'])}`, '', '> Finalizing process...');
      for (const s of sample(['Committing changes', 'Syncing with core bus', 'Updating state registers', 'Saving configuration', 'Releasing resources', 'Logging execution', 'Clearing temporary data'], 3)) { st.push(`   → ${s}...........OK`); w(); }
      st.push('', '[✓] COMMAND EXECUTED SUCCESSFULLY', '');
    } else {
      const base = command.split('.')[0];
      st.push('', '!! ERROR DETECTED !!', '> ' + choice([`Exec-channel integrity failure during ${base}`, `Opcode rejected by secure gate for ${command}`, `Permission denied for ${command} execution`, `Invalid instruction sequence in ${base}`, `Resource conflict with ${base} command`]));
      if (Math.random() < 0.5) st.push('> Integrity check failed');
      st.push('', '[FAIL REPORT]', ` • CODE        : 0x${randInt(16384, 65535).toString(16).toUpperCase()}-CMDFAIL`, ` • LOCATION    : ${mod}`,
        ` • REASON      : ${choice([`Unsafe ${command} sequence`, `Access violation in ${base}`, `Invalid parameters for ${command}`, `Dependency failure for ${command}`])}`,
        ` • STATUS      : ${choice(['Immediate abort', 'Forced termination', 'Error halt', 'Critical failure'])}`, '', '> Initiating rollback...');
      for (const s of sample(['Flushing partial writes', 'Restoring snapshot', 'Stabilizing core bus', 'Reverting changes', 'Clearing error state', 'Logging failure'], 3)) { st.push(`   → ${s}...........OK`); w(); }
      st.push('', '[✖] COMMAND FAILED — SYSTEM SAFE', '');
    }
    return st;
  },
  memoryPatch() {
    return ['', '[SYS://VALUE_WRITE]', 'Target parameter detected.', '> Initializing memory patch...', { wait: this.r(150, 500) }, '> Allocating sector...', { wait: this.r(150, 500) },
      '> Injecting payload...', '', { progress: 'Writing' }, '', '> Verifying integrity...', '> Syncing with core bus...', { wait: this.r(150, 500) }, '> Commit successful.', '[✓] MEMORY CELL UPDATED', ''];
  },
  seq(title, intro, report, finale, done) {
    const st = ['', `[SYS://${title}]`];
    for (const l of intro) { st.push(l); if (l.startsWith('>')) st.push({ wait: this.r(120, 450) }); }
    st.push('', `[${report[0]}]`, ...report.slice(1), '');
    for (const l of finale) { st.push(`   → ${l}`); st.push({ wait: this.r(120, 400) }); }
    st.push('', done, '');
    return st;
  },
  showAdduser(u) {
    return this.seq('ADDUSER', ['Operation request acknowledged.', 'Action → create.user', '> Initializing identity module...', '> Verifying creation permissions...', '> Allocating registry slot...', '> Generating user credentials...', '> Building default profile structure...'],
      ['CREATION REPORT', ` • TARGET      : ${u}`, ' • STATUS      : successfully created', ' • PROFILE     : baseline configuration applied', ' • SECURITY    : encrypted & verified'],
      ['Syncing with user registry......OK', 'Sealing credential block........OK', 'Activating account modules......OK'], '[✓] USER ADDED SUCCESSFULLY');
  },
  showDeluser(u) {
    return this.seq('DELUSER', ['High-risk command received.', 'Action → delete.user', '> Accessing user registry...', '> Verifying authorization level...', '> Locking target user profile...', '', '!! WARNING !!', 'User deletion is irreversible.', '> Executing purge sequence...', '> Revoking credentials...', '> Erasing activity logs...', '> Removing account fingerprint...'],
      ['DELETE REPORT', ` • TARGET      : ${u}`, ' • STATUS      : purged', ' • TRACE       : identifiers destroyed', ' • EFFECT      : non-recoverable deletion'],
      ['Flushing registry cache.......Done!', 'Closing orphaned handles......Done!', 'Re-sealing registry path......Done!'], '[✓] USER DELETED — NO POSSIBLE RECOVERY');
  },
  showAccountReset(u) {
    return this.seq('ACCOUNT_RESET', ['High-security operation detected.', 'Action → reset.account', '> Initializing identity module...', '> Verifying authorization token...', '> Syncing with user registry...', '', '!! CRITICAL OPERATION WARNING !!', 'Target account flagged for full reset.', '> Executing purge protocol...', '> Dropping session keys...'],
      ['RESET REPORT', ` • TARGET      : ${u}`, ' • MODE        : irreversible reset', ' • STATUS      : Complete'],
      ['Scrubbing data blocks.........OK', 'Flushing cache entries........OK', 'Seal-locking registry path....OK'], '[✓] ACCOUNT RESET TO DEFAULTS');
  },
  showGameReset() {
    return ['', '[SYS://GAME_RESET]', 'Critical system command received.', 'Action → full.reset', '> Accessing core save-state...', { wait: this.r(150, 500) }, '> Validating reset permissions...', { wait: this.r(150, 500) },
      '', '!! WARNING !!', 'This operation will erase ALL progress,', 'saved data, configurations, and user states.', '', '[RESET SEQUENCE]', { progress: 'Wiping' },
      '', '[RESET REPORT]', ' • SCOPE       : all user accounts', ' • EFFECT      : irreversible reset', ' • STATUS      : clean state restored', '', '[✓] FULL GAME RESET COMPLETE', ''];
  },
  collectDB() {
    return ['', '[SYS://USERDB_COLLECT]', 'Action → collect.user_database', '> Initializing data-scan module...', { wait: this.r(100, 350) }, '> Establishing secure link to registry...', { wait: this.r(100, 350) },
      '> Harvesting identifiers...', { wait: this.r(100, 350) }, '> Compiling unified dataset...', { wait: this.r(100, 350) }, '', '[COLLECTION REPORT]', ' • SOURCE      : global user registry', ' • STATUS      : compilation complete', '', '[✓] USER DATABASE SUCCESSFULLY COLLECTED', ''];
  },

  // ---------- command runner ----------
  run(line) {
    const out = [];
    const say = (...l) => out.push(...l);
    const users = Store.data.users;
    const raw = line.trim();
    const lower = raw.toLowerCase();

    if (this.guess) {   // inside 'play'
      if (EXIT_WORDS.includes(lower) || lower === 'stop') { this.guess = null; say('Game cancelled.'); return out; }
      const n = parseInt(raw, 10);
      if (!Number.isFinite(n)) { say('Please enter a valid number.'); return out; }
      this.guess.attempts++;
      if (n < this.guess.number) say('Too low!');
      else if (n > this.guess.number) say('Too high!');
      else {
        const pts = Math.max(0, 10 - this.guess.attempts);
        if (G.user) G.user.score += pts;
        say(`Correct! You guessed it in ${this.guess.attempts} attempts.`, `Score updated. New score: ${G.user ? G.user.score : '-'}`);
        this.guess = null; G.save();
        say(...this.simExec('play number guessing game', true), ...this.memoryPatch());
      }
      return out;
    }
    if (EXIT_WORDS.includes(lower)) return 'EXIT';

    const { cmd, args } = this.parse(raw);
    const getU = n => { const u = n && users[String(n).toLowerCase()]; if (!u) say(n ? 'User not found.' : null); return u; };
    const int = s => { const n = Number(s); return Number.isFinite(n) ? Math.floor(n) : null; };
    const withUser = (u, fn) => { const prev = G.user; G.user = u; try { fn(); } finally { G.user = prev; } };
    const finish = (name, ok, patch = true) => { say(...this.simExec(name, ok)); if (ok && patch) say(...this.memoryPatch()); };
    const usage = (name, text) => { say(`Usage: ${text}`); finish(name, false); };

    switch (cmd) {
      case '': break;
      case 'help': case 'h': case '?': say(...this.helpLines()); break;
      case 'clear': case 'cls': return 'CLEAR';
      case 'anim': this.anim = (args[0] || '').toLowerCase() !== 'off'; say(`Animations ${this.anim ? 'ON' : 'OFF'}.`); break;

      case 'users': case 'usrs': case 'u': {
        say(...this.simExec('users', true), ...this.collectDB(), '--- Top 10 Users ---');
        const list = Object.values(users).sort((a, b) => b.score - a.score).slice(0, 10);
        for (const u of list) say(`${u.username}: Score ${u.score.toLocaleString()}, Money $${u.money.toLocaleString()}, Lv ${u.player.level}`);
        if (!list.length) say('(no users)');
        say('---'); break;
      }
      case 'current': case 'curr': case 'c': {
        if (G.user) say(`Current user: ${G.user.username}, Score: ${G.user.score.toLocaleString()}, Money: $${G.user.money.toLocaleString()}`);
        else say('No current user logged in.');
        finish('current', !!G.user); break;
      }
      case 'numbers': say('Random numbers generated this session: (not tracked)'); finish('numbers', true); break;
      case 'play': {
        if (!G.user) { say('No current user logged in.'); finish('play number guessing game', false); break; }
        this.guess = { number: randInt(1, 100), attempts: 0 };
        say('Welcome to the Number Guessing Game!', "I'm thinking of a number between 1 and 100.", 'Enter your guess (or "stop"):'); break;
      }
      case 'adduser': {
        if (args.length < 2) { usage('adduser', 'adduser <username> <password>'); break; }
        const r = G.signup(args[0], args.slice(1).join(' '));
        if (r.ok) say(...this.showAdduser(args[0].toLowerCase())); else say(r.msg, 'Failed to create user.');
        finish('adduser', r.ok, false); break;
      }
      case 'deluser': {
        if (!args[0]) { usage('deluser', 'deluser <username>'); break; }
        const u = getU(args[0]);
        if (u && G.user === u) { say('Cannot delete the account you are logged in with.'); finish('deluser', false); break; }
        if (u) { delete users[u.username]; if (Store.data.remember === u.username) Store.data.remember = null; say(...this.showDeluser(u.username)); }
        finish('deluser', !!u, false); break;
      }
      case 'reset': {
        const me = G.user;
        Store.data.users = me ? { [me.username]: me } : {};
        say(...this.showGameReset(), me ? `All users reset (your account "${me.username}" was kept so this session survives — use deluser from another account to remove it).` : 'All users reset.');
        finish('reset', true, false); break;
      }
      case 'resetplayer': {
        if (!args[0]) { usage('resetplayer', 'resetplayer <username>'); break; }
        const u = getU(args[0]);
        if (u) { say(...this.showAccountReset(u.username)); u.player = defaultPlayer(); u.score = 0; u.money = 40; if (G.user === u) G.fight = null; say(`Player ${u.username} reset to defaults.`); }
        finish('resetplayer', !!u); break;
      }
      case 'setdmoney': {
        const n = int(args[0]);
        if (n === null) { usage('setdmoney', 'setdmoney <n>'); break; }
        G.treasure.money = n; say(`Dungeon treasure set to $${n.toLocaleString()}`); finish('setdmoney', true); break;
      }
      case 'setscore': case 'setmoney': {
        const field = cmd === 'setscore' ? 'score' : 'money';
        if (args.length < 2) { usage(cmd, `${cmd} <username> <${field}>`); break; }
        const u = getU(args[0]), n = int(args[1]);
        if (u && n === null) say(`Invalid ${field}.`);
        const ok = !!u && n !== null;
        if (ok) { u[field] = n; say(`${field === 'score' ? 'Score' : 'Money'} for ${u.username} set to ${field === 'money' ? '$' : ''}${n.toLocaleString()}.`); }
        finish(cmd, ok); break;
      }
      case 'setexp': {
        if (args.length < 2) { usage('setexp', 'setexp <username> <exp>'); break; }
        const u = getU(args[0]), n = int(args[1]);
        if (u && n === null) say('Invalid EXP.');
        const ok = !!u && n !== null;
        if (ok) { const before = u.player.level; u.player.exp = Math.max(0, n); withUser(u, () => G.grantExp(0)); say(`EXP for ${u.username} set to ${n.toLocaleString()}.`); if (u.player.level !== before) say(`(level ${before} → ${u.player.level})`); }
        finish('setexp', ok); break;
      }
      case 'setlvl': case 'setlevel': {
        if (args.length < 2) { usage('setlvl', 'setlvl <username> <level>'); break; }
        const u = getU(args[0]), n = int(args[1]);
        if (u && n === null) say('Invalid level.');
        const ok = !!u && n !== null;
        if (ok) { u.player.level = clamp(n, 1, BAL.MAX_LEVEL); u.player.exp = 0; withUser(u, () => { G.unlockLevelTitles(); G.checkAchievements(); G.clampVitals(); }); say(`Level for ${u.username} set to ${u.player.level}.`); }
        finish('setlvl', ok); break;
      }
      case 'setdefeated': {
        if (args.length < 3) { usage('setdefeated', 'setdefeated <username> <monsters|bosses> <n>'); break; }
        const u = getU(args[0]), typ = args[1].toLowerCase(), n = int(args[2]);
        let ok = !!u && n !== null;
        if (u && n === null) say('Invalid number.');
        if (ok) {
          if (typ.startsWith('monster')) u.player.counters.monsters_defeated = n;
          else if (typ.startsWith('boss')) u.player.counters.bosses_defeated = n;
          else { say(`Invalid type: ${typ}`); ok = false; }
          if (ok) { withUser(u, () => G.checkAchievements()); say(`${typ} defeated for ${u.username} set to ${n.toLocaleString()}.`); }
        }
        finish('setdefeated', ok); break;
      }
      case 'set': {
        if (args.length < 3) { usage('set', 'set <username> <stat> <n>'); break; }
        const u = getU(args[0]), stat = args[1].toLowerCase(), n = int(args[2]);
        const path = STAT_MAP[stat];
        let ok = !!u && n !== null && !!path;
        if (u && !path) say(`Invalid stat: ${stat}`, `Valid stats: ${Object.keys(STAT_MAP).join(', ')}`);
        else if (u && n === null) say('Invalid number.');
        if (ok) {
          if (path.length === 1) u.player[path[0]] = n; else u.player[path[0]][path[1]] = n;
          if (stat === 'level') withUser(u, () => G.unlockLevelTitles());
          say(`${stat} for ${u.username} set to ${n.toLocaleString()}.`);
        }
        finish('set', ok); break;
      }
      case 'setdodge': {
        if (args.length < 2) { usage('setdodge', 'setdodge <username> <n>'); break; }
        const u = getU(args[0]), n = int(args[1]);
        const ok = !!u && n !== null;
        if (ok) { u.player.dodge = u.player.max_dodge = Math.max(0, n); say(`Dodge points for ${u.username} set to ${n}.`); }
        finish('setdodge', ok); break;
      }
      case 'showfull': {
        say(...this.collectDB());
        if (!args[0]) { usage('showfull', 'showfull <username>'); break; }
        const u = getU(args[0]); if (!u) { finish('showfull', false); break; }
        say(...this.simExec('showfull', true));
        const p = u.player;
        say(`Full data for ${u.username}:`, `score: ${u.score.toLocaleString()}   money: $${u.money.toLocaleString()}`,
          `level: ${p.level}   exp: ${p.exp.toLocaleString()}   area: ${p.area}   hp: ${p.hp}   mana: ${p.mana}   dodge: ${p.dodge}/${p.max_dodge}`,
          `base:  ${JSON.stringify(p.base)}`, `perm:  ${JSON.stringify(p.perm)}`, `equipped: ${JSON.stringify(p.equipped)}`,
          `spells: ${p.equipped_spells.map(x => x || '-').join(', ')}   learned: ${p.learned_spells.length}`,
          `titles: ${p.equipped_titles.map(x => x || '-').join(', ')}   unlocked: ${p.titles.length}`,
          `achievements: ${p.achievements.join(', ') || '-'}`, `counters: ${JSON.stringify(p.counters)}`, 'inventory:');
        for (const [k, v] of Object.entries(p.inventory)) say(`  ${k}: ${v}`);
        say('---'); break;
      }
      case 'give': {
        if (args.length < 2) { usage('give', 'give <username> <item> [qty]'); break; }
        const u = getU(args[0]);
        let item = args[1].toLowerCase(); item = UPGRADE_ALIASES[item] || item;
        const q = args[2] !== undefined ? int(args[2]) : 1;
        let ok = !!u;
        if (u && !D.ITEMS[item]) { say(`Unknown item: ${item}  (type "items" to list keys)`); ok = false; }
        if (ok && (q === null || q < 1)) { say('Invalid quantity. Quantity must be a positive integer.'); ok = false; }
        if (ok) {
          const have = u.player.inventory[item] || 0, add = Math.min(q, BAL.MAX_STACK - have);
          if (add <= 0) { say(`${u.username}'s ${item} stack is already full (${BAL.MAX_STACK.toLocaleString()}).`); ok = false; }
          else { u.player.inventory[item] = have + add; say(`Gave ${add.toLocaleString()}x ${item} to ${u.username}.` + (add < q ? ` (capped — max stack is ${BAL.MAX_STACK.toLocaleString()})` : '')); }
        }
        finish('give', ok); break;
      }
      case 'ruinthefun': {
        const name = args[0] || (G.user && G.user.username);
        if (!name) { usage('ruinthefun', 'ruinthefun(username)'); break; }
        const u = getU(name); if (!u) { finish('ruinthefun', false); break; }
        const p = u.player;
        p.level = BAL.MAX_LEVEL; p.exp = 0;
        p.base.hp_max += 2500; p.base.mana_max += 750; p.base.atk += 1000; p.base.def += 500;
        const pa = { atk: 500, def: 200, hp: 5000, mana: 250, crit: 100, mana_regen: 200, lifesteal: 200, lifesteal_chance: 100, exp: 500 };
        for (const [k, v] of Object.entries(pa)) p.perm[k] += v;
        p.achievements = Object.keys(D.ACHIEVEMENTS);
        p.titles = Object.keys(D.TITLES);
        p.learned_spells = Object.keys(D.SPELLS_BY_KEY);
        for (const k of Object.keys(D.POTIONS)) p.inventory[k] = (p.inventory[k] || 0) + 500;
        for (const it of Object.values(D.ITEMS)) if (it.cat in p.equipped) p.inventory[it.key] = Math.max(1, p.inventory[it.key] || 0);
        for (const k of Object.keys(D.MATERIALS)) p.inventory[k] = (p.inventory[k] || 0) + 500;
        for (const k of Object.keys(D.PERM_UPGRADES)) p.inventory[k] = (p.inventory[k] || 0) + 250;
        for (const k of Object.keys(D.MAGIC_PACKS)) p.inventory[k] = (p.inventory[k] || 0) + 500;
        u.score += 1000000; u.money += 1000000;
        withUser(u, () => { G.autoEquipTitles(); G.autoEquipItems(); G.autoEquipSpells(); const d = G.derive(); p.hp = d.hpMax; p.mana = d.manaMax; p.dodge = p.max_dodge; });
        say(`Ruin the fun activated for ${u.username}.`);
        finish('ruinthefun', true); break;
      }
      case 'spawn': {
        const type = (args[0] || '').toLowerCase().startsWith('b') ? 'boss' : 'normal';
        const name = D.MONSTER_ALIASES[type][(args[1] || '').toLowerCase()];
        const m = name && D.MONSTERS.find(x => x.name === name && (type === 'boss') === !!x.is_boss);
        if (!m) { say(`Unknown ${type} alias. Type "monsters" for the list.`); finish('spawn', false); break; }
        G.forcedMonster = deepClone(m);
        say(`Next exploration will spawn ${m.name} (HP ${m.hp.toLocaleString()}, ATK ${m.atk_min}–${m.atk_max}).`);
        finish('spawn', true, false); break;
      }
      case 'monsters': {
        for (const t of ['boss', 'normal']) {
          say(`--- ${t} ---`);
          const ok = Object.entries(D.MONSTER_ALIASES[t]).filter(([, n]) => D.MONSTERS.some(m => m.name === n && (t === 'boss') === !!m.is_boss));
          for (let i = 0; i < ok.length; i += 4) say(ok.slice(i, i + 4).map(([a, n]) => `${a.padEnd(5)} ${n}`.padEnd(30)).join(''));
        }
        break;
      }
      case 'items': {
        const f = (args[0] || '').toLowerCase();
        const keys = Object.keys(D.ITEMS).filter(k => !f || k.includes(f) || D.ITEMS[k].cat === f);
        for (let i = 0; i < keys.length; i += 3) say(keys.slice(i, i + 3).map(k => k.padEnd(32)).join(''));
        say(`(${keys.length} items)`); break;
      }
      default:
        say("Unknown command. Type 'help' for commands.");
    }
    for (const u of Object.values(Store.data.users)) clampInventory(u.player);   // no command can overflow a stack
    G.save();
    return out.filter(x => x !== null);
  },
};
