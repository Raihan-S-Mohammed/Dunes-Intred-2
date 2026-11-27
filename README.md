# The Dunes Intred — Browser Edition

A browser version of `fullcode.py`. It's plain HTML/CSS/JavaScript with no install and no build step.

## How to play on any PC
You don't need to install anything: no Python, no Node, no game launcher. All you need is a web browser (Chrome, Edge or Firefox).

### Option 1: Download and play offline
1. On this page, click the green **`<> Code`** button near the top, then click **Download ZIP**.
2. Find `Dunes-Intred-2-main.zip` in your Downloads folder. Right-click it, choose **Extract All…**, then click **Extract**.
3. Open the extracted `Dunes-Intred-2-main` folder and double-click **`index.html`**. The game opens in your browser.

Keep all the files together: `index.html` needs the `css` and `js` folders next to it, so don't move it out of the folder on its own. Tip: right-click `index.html` → **Send to → Desktop (create shortcut)** to start the game from your desktop.

### Option 2: Play online (no download)
If GitHub Pages is turned on for this repo, play at **https://raihan-s-mohammed.github.io/Dunes-Intred-2/**.

To turn it on (repo owner, one time): **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main`, folder `/ (root)` → Save**. The link starts working about a minute later.

### Saves
- Progress is saved automatically **in the browser you play in**, on that PC. A different browser or a different PC starts fresh.
- To move your progress, use **Settings → Export save** on the old PC, then **Settings → Import save** on the new one.
- The downloaded version and the online version keep separate saves. Use Export/Import to move between them too.
- An internet connection is only used to load the fonts. The game works fully offline.

## Files
| File | What it is |
|---|---|
| `js/data.js` | Game data tables, auto-extracted from `fullcode.py` (monsters, items, spells, titles, recipes) |
| `js/data-extra.js` | Data fixes, achievements, the item registry, potions, and **`BAL` balance knobs and safety limits** |
| `js/avatar.js` | SVG avatar builder |
| `js/engine.js` | Game logic: accounts, stats, combat, shop, crafting, trades, notifications |
| `js/debug.js` | Debug console (port of `debug_console`) |
| `js/ui.js` | Screens, tabs, search, buttons, keyboard shortcuts |
| `js/social-ui.js` | Profiles, avatar creator, trades, notifications, leaderboard |
| `js/main.js` | Starts the game (loaded last) |
| `css/style.css` | Styling |

## Controls
- In combat: `A` attack, `M` magic (then `1`–`4`), `D` dodge, `P` items, `R` run.
- On the dungeon screen: `E` explore.
- Type `10234` anywhere outside a text box to open the debug console. It asks the same security question as the original, and `tester01` skips the question.
  - It has every original command (`users`, `current`, `numbers`, `play`, `adduser`, `deluser`, `reset`, `resetplayer`, `setdmoney`, `setscore`, `setmoney`, `setexp`, `setlvl`, `setdefeated`, `set`, `showfull`, `give`, `setdodge`, `ruinthefun`, `exit`/`dilsaf`/`get out`…), with the original animated system output. Press Enter while it is printing to skip the animation.
  - Both syntaxes work: `ruinthefun(raider)` or `ruinthefun raider`, and `setmoney(raider, 500)` or `setmoney raider 500`.
  - Extras: `spawn boss gk` replaces the old `explore 10234 boss gk` trick. `monsters` and `items` list the aliases and item keys, `anim off` turns off the animations, and `clear` clears the screen.

## Social features
- **Avatar:** the avatar creator opens right after you create an account. You can change it later from **Profile → Customize avatar** or **Settings**.
- **Profile:** shows your avatar, title, level, power, leaderboard ranks, bio, everything equipped (gear, spells, titles), stats, a showcase of up to 6 items you pin with ☆ in the Inventory, your best items and your achievements. Click any player (on the leaderboard, in the Players list, or in a trade) to view their profile.
- **Trades:** offer any items or money for theirs. The only thing you can't trade is the copy of an item you have equipped. Both sides are re-checked at the moment of acceptance, so a stale offer fails instead of duplicating items. Sent, accepted, declined, cancelled and failed offers all create notifications (🔔).
- Players are the accounts saved in this browser, like the shared `users.txt` in the Python version. If two accounts are open in two tabs, they sync live.

## EXP and Coin boosters
- **EXP potions and Coin potions:** ×2, ×4, ×8, ×16, ×64, ×1024 and ×5012, each lasting 5, 10, 15 or 20 battles. EXP potions multiply EXP and Coin potions multiply the money monsters drop.
  - **Stacking:** using the same multiplier again adds its battles to the timer (three ×16 potions of 5 battles give ×16 for 15 battles). Different multipliers queue: the strongest one runs and the others wait their turn, so no potion is ever wasted.
  - **Rarity:** ×2 and ×4 are fairly reachable. From ×8 upward each tier gets far rarer, up to basically impossible. Approximate kills per drop in area 100, for each of EXP and Coin (bosses are 5× better, super bosses 20×):

    | ×2 | ×4 | ×8 | ×16 | ×64 | ×1024 | ×5012 |
    |---|---|---|---|---|---|---|
    | 84 | 300 | 2,700 | 23,000 | 280,000 | 3.6 million | 45 million |

  - **Crafting:** from ×8 upward, each recipe also needs potions of the tier below (3× ×4 → ×8, 4× ×8 → ×16, 5× ×16 → ×64, 8× ×64 → ×1024, 10× ×1024 → ×5012), on top of material amounts that scale ×3, ×6, ×12, ×25 and ×50. A single ×5012 works out to about 4,800 ×4 potions plus thousands of top-tier materials.
- **Perm EXP Gain Upgrade:** +50% EXP as a separate multiplier. It can drop in every area, and the chance rises with the area (0.17% at area 1 up to 2.1% at area 100; bosses 4–24%). It can also be crafted.

## Safety limits
Set in `BAL` in `js/data-extra.js`. They exist so huge numbers can't freeze the game, as happened in Dunes Intred 1.
- An item stack holds at most **1,000,000**. This applies to drops, crafting, buying, trades, and debug `give` and `ruinthefun`. Old saves with bigger numbers are trimmed when they load.
- **Use** and **All** use at most **1,000** potions or packs per click, and **100,000** permanent upgrades. The message tells you how many are left.
- One EXP or Coin multiplier can store at most **100,000** battles.

## Bugs fixed from fullcode.py
- `check_achievements` only checked the last achievement because of an indentation bug.
- Crafted items had no stats: `WEAPONS`, `ARMORS` and the other item tables were redefined after the crafted items were merged in, which wiped them.
- Crafting saved `player_data = {'inventory': ...}`, which wiped all of the player's stats.
- The death check only ran when a dodge point regenerated, so you could reach negative HP and keep fighting.
- Armor was ignored when monsters attacked. Necklace HP/Mana/crit/lifesteal, permanent HP/Mana, mana regen and title percentage bonuses were never applied.
- Buffs never expired. Boss permanent upgrades were added twice. Material drops were rolled twice.
- The boss treasure message said 20% while the code gave 10% and removed 20%.
- `explore_dungeon` treated the treasure dict as a number. It is now "Search for treasure".
- `name_display` crashed when "call including title" was off.
- Area 2 needed level 76, and areas without their own monsters pulled from all monsters, so level-1 players could meet area-99 monsters.
- Mirror Shield, Holy Barrier and Resurgence did nothing. Lightning and ice spells stunned 95% of the time.
- Grim Reaper gave 9.6M EXP, a typo. `void_core` and `titan_core` drops didn't exist as items.
