"use strict";
/* SVG avatar builder. An avatar is a config object stored on the account:
   { bg, skin, hair, hairColor, eyes, mouth, headgear, outfit, extra, frame }

   Layering is fit-aware so every combination lines up:
   - every hair style describes its silhouette (top, where a hat rests, how wide it is there)
     and has an "under a hat" variant (fringe/side locks) used by wizard hat, helmet and hood;
   - crowns sit on the hair at the right height and width, halos float above the tallest point,
     horns grow from the head through the hair;
   - beards leave room for the mouth, the mouth is drawn on top with a moustache. */

const AVATAR_OPTS = {
  bg:        { label: 'Background', type: 'color', values: ['#2b3a67', '#4a2a5e', '#5e2a2a', '#22543d', '#5e4a1e', '#1e4e5e', '#333845', '#0f1117'] },
  skin:      { label: 'Skin', type: 'color', values: ['#f6d7c3', '#eabf9b', '#d39a6a', '#a86f45', '#7a4a2a', '#4e2f1c', '#9fd6a4', '#a9b9e8'] },
  hair:      { label: 'Hair', type: 'pick', values: ['none', 'short', 'spiky', 'long', 'mohawk', 'bun', 'wild'] },
  hairColor: { label: 'Hair colour', type: 'color', values: ['#1d1a19', '#5a3820', '#a8642a', '#e6c066', '#d9d9d9', '#b0303a', '#3a6fd8', '#8e44ad'] },
  eyes:      { label: 'Eyes', type: 'pick', values: ['dots', 'happy', 'angry', 'sleepy', 'glow', 'wink'] },
  mouth:     { label: 'Mouth', type: 'pick', values: ['smile', 'grin', 'flat', 'open', 'smirk'] },
  headgear:  { label: 'Headgear', type: 'pick', values: ['none', 'crown', 'wizard', 'horns', 'halo', 'helmet', 'hood'] },
  outfit:    { label: 'Outfit', type: 'color', values: ['#7a2a2a', '#2a4f7a', '#2f6b3a', '#5b3a8a', '#8a6a2a', '#3a3a3a', '#c0c0c0', '#a0306a'] },
  extra:     { label: 'Extra', type: 'pick', values: ['none', 'beard', 'scar', 'mask', 'blush', 'eyepatch'] },
  frame:     { label: 'Frame', type: 'pick', values: ['none', 'common', 'rare', 'mythical', 'prismatic', 'divine', 'transcendent'] },
};
const FRAME_COLORS = { common: '#9aa4b2', rare: '#4da3ff', mythical: '#b06cff', prismatic: '#ff6ad5', divine: '#ffd166', transcendent: '#ff4d6d' };

function defaultAvatar() { return { bg: '#2b3a67', skin: '#eabf9b', hair: 'short', hairColor: '#5a3820', eyes: 'dots', mouth: 'smile', headgear: 'none', outfit: '#2a4f7a', extra: 'none', frame: 'none' }; }
function randomAvatar() {
  const a = {};
  for (const [k, o] of Object.entries(AVATAR_OPTS)) a[k] = k === 'frame' ? 'none' : o.values[Math.floor(Math.random() * o.values.length)];
  return a;
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = s => Math.max(0, Math.min(255, ((n >> s) & 255) + amt));
  return '#' + ((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0');
}

/* Head: ellipse cx 50, cy 46, rx 21, ry 23 (top y=23, chin y=69). */
const FRINGE = 'M29.5 41 C29 31 37 26.5 50 26.5 C63 26.5 71 31 70.5 41 C67 35.5 62 33.5 56 34 C52 32.5 48 32.5 44 34 C38 33.5 33 35.5 29.5 41 Z';
/* For each hair: back (behind head), front (on head), under (variant under a wizard hat / helmet / hood),
   top = highest point, capY = where a crown rests, capHalf = half-width of the hair at capY. */
const HAIR = {
  none:   { top: 23, capY: 28.5, capHalf: 13 },
  short:  { top: 17.5, capY: 24, capHalf: 16.5,
            front: 'M28.2 44 C27 27 36 17.5 50 17.5 C64 17.5 73 27 71.8 44 C70 37 66.5 33 61 32 C55 34 45 34 39 32 C33.5 33 30 37 28.2 44 Z',
            under: FRINGE },
  long:   { top: 16, capY: 23, capHalf: 17.5,
            back: 'M27.5 42 C26 21 37 15.5 50 15.5 C63 15.5 74 21 72.5 42 L75 79 C71 83 66 82 63.5 78 L62 52 L38 52 L36.5 78 C34 82 29 83 25 79 Z',
            front: 'M28.2 45 C27 26 37 16.5 50 16.5 C63 16.5 73 26 71.8 45 C69 36 63 31.5 54 32.5 C50 29 46 29 43 32.5 C35 32 30.5 37 28.2 45 Z',
            under: FRINGE, underBack: true },
  spiky:  { top: 11, capY: 25.5, capHalf: 17,
            front: 'M27.8 45 L27 30 L33.5 33 L34 20 L41 26.5 L45 12.5 L51 23.5 L57 11 L60 25 L67 18.5 L67.5 31 L73 29 L72.2 45 C70 37 64.5 32.5 50 32.5 C35.5 32.5 30 37 27.8 45 Z',
            under: 'M29.5 41 L30 31 L35 33.5 L39 28 L43 32 L48 27.5 L52 32 L57 27.5 L61 32 L65 28 L70 31.5 L70.5 41 C66 35 60 33.5 50 34 C40 33.5 34 35 29.5 41 Z' },
  mohawk: { top: 4, capY: 28.5, capHalf: 13,
            front: 'M44.5 34 C43 21 45 9 50 4 C55 9 57 21 55.5 34 C53.5 32.5 46.5 32.5 44.5 34 Z',
            stubble: true, under: null },
  bun:    { top: 5, capY: 24, capHalf: 16.5,
            front: 'M28.2 44 C27 27 36 17.5 50 17.5 C64 17.5 73 27 71.8 44 C70 37 66.5 33 61 32 C55 34 45 34 39 32 C33.5 33 30 37 28.2 44 Z',
            bun: true, under: FRINGE },
  wild:   { top: 6, capY: 21.5, capHalf: 21,
            back: 'M21 54 C14 44 16 33 22 28 L78 28 C84 33 86 44 79 54 Z',
            front: 'M23 49 C17 37 20 25 28 22 C27 12 38 8.5 44.5 13 C48 5 58 5.5 61 12 C70 9 80 15.5 76.5 26 C83 32 82.5 42 77 49 C74.5 39.5 68.5 33.5 60.5 32.5 C53.5 34.5 46.5 34.5 39.5 32.5 C31.5 33.5 25.5 39.5 23 49 Z',
            under: 'M24 50 C20 43 22 36 29.5 33 L29.5 41 C33 35.5 38 33.5 44 34 C48 32.5 52 32.5 56 34 C62 33.5 67 35.5 70.5 41 L70.5 33 C78 36 80 43 76 50 C74 45 72 42 70.5 41.5 L29.5 41.5 C28 42 26 45 24 50 Z' },
};
const COVERING = ['wizard', 'helmet', 'hood'];   // headgear that hides the top of the hair

let AV_UID = 0;
function avatarSVG(cfg, size = 64) {
  const uid = ++AV_UID;
  const a = Object.assign(defaultAvatar(), cfg || {});
  const H = a.hairColor, S = a.skin, skinDark = shade(S, -38), ink = '#1b1414';
  const hair = HAIR[a.hair] || HAIR.none, hg = a.headgear, covered = COVERING.includes(hg);
  const beard = a.extra === 'beard';
  const P = [];
  const add = s => P.push(s);

  // ---- background
  add(`<rect width="100" height="100" fill="${a.bg}"/>`);
  add(`<circle cx="50" cy="40" r="36" fill="${shade(a.bg, 22)}" opacity=".55"/>`);

  // ---- behind the head
  // halo: above short hair; behind the head (hair passes in front of it) for tall styles
  const haloRing = (cy, rx, ry) => `<ellipse cx="50" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#ffe27a" stroke-width="3.4"/><ellipse cx="50" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#fff8d6" stroke-width="1"/>`;
  const haloBehind = hg === 'halo' && hair.top < 14;
  if (haloBehind) add(`<g opacity=".95">${haloRing(a.hair === 'wild' ? 9 : 12, a.hair === 'wild' ? 30 : 22, a.hair === 'wild' ? 6.5 : 5.5)}</g>`);
  if (hg === 'hood') add(`<path d="M17 80 C13 44 24 11 50 9 C76 11 87 44 83 80 Z" fill="${shade(a.outfit, -28)}"/>`);
  if (hair.back && (!covered || (hair.underBack && hg !== 'hood'))) add(`<path d="${hair.back}" fill="${shade(H, -12)}"/>`);
  if (hair.bun && !covered) add(`<circle cx="50" cy="12.5" r="7.5" fill="${H}"/><path d="M44 16 Q50 19 56 16" stroke="${shade(H, -35)}" stroke-width="1.4" fill="none"/>`);

  // ---- body & neck
  add(`<path d="M13 100 C13 81 29 73 50 73 C71 73 87 81 87 100 Z" fill="${a.outfit}"/>`);
  add(`<path d="M37 74.5 L50 87 L63 74.5" fill="none" stroke="${shade(a.outfit, 45)}" stroke-width="3" stroke-linejoin="round"/>`);
  add(`<path d="M43.5 60 L56.5 60 L57.5 75 Q50 79 42.5 75 Z" fill="${skinDark}"/>`);

  // ---- head
  add(`<ellipse cx="29.5" cy="47.5" rx="4.5" ry="5.5" fill="${S}"/><ellipse cx="70.5" cy="47.5" rx="4.5" ry="5.5" fill="${S}"/>`);
  add(`<ellipse cx="29.8" cy="47.5" rx="2" ry="3" fill="${skinDark}" opacity=".5"/><ellipse cx="70.2" cy="47.5" rx="2" ry="3" fill="${skinDark}" opacity=".5"/>`);
  add(`<ellipse cx="50" cy="46" rx="21" ry="23" fill="${S}"/>`);
  if (hair.stubble && !covered) add(`<path d="M30 40 C30 30 38 24.5 50 24.5 C62 24.5 70 30 70 40 C64 33 58 31.5 50 31.5 C42 31.5 36 33 30 40 Z" fill="${H}" opacity=".28"/>`);

  // ---- face details
  if (a.extra === 'blush') add(`<ellipse cx="37" cy="54" rx="4.5" ry="3" fill="#ff6f86" opacity=".4"/><ellipse cx="63" cy="54" rx="4.5" ry="3" fill="#ff6f86" opacity=".4"/>`);
  if (a.extra === 'mask') add(`<path d="M28.8 40 C40 36.5 60 36.5 71.2 40 L71.2 49.5 C60 46.5 40 46.5 28.8 49.5 Z" fill="#202024"/>`);
  if (beard) add(`<path d="M29 46 C28.5 61 36.5 73.5 50 75 C63.5 73.5 71.5 61 71 46 C68.5 53 65 56.5 61 57.5 C57 55.5 43 55.5 39 57.5 C35 56.5 31.5 53 29 46 Z" fill="${H}"/>`);

  // eyes
  const pupil = a.extra === 'mask' ? '#ffffff' : ink;
  const eye = (x, kind) => {
    switch (kind) {
      case 'happy': return `<path d="M${x - 4} 46.5 Q${x} 41.5 ${x + 4} 46.5" fill="none" stroke="${a.extra === 'mask' ? '#fff' : ink}" stroke-width="2.4" stroke-linecap="round"/>`;
      case 'sleepy': return `<path d="M${x - 4} 45.5 Q${x} 48 ${x + 4} 45.5" fill="none" stroke="${a.extra === 'mask' ? '#fff' : ink}" stroke-width="2.4" stroke-linecap="round"/>`;
      case 'glow': return `<circle cx="${x}" cy="45" r="6" fill="#7ff3ff" opacity=".22"/><circle cx="${x}" cy="45" r="3.4" fill="#7ff3ff"/><circle cx="${x - 1}" cy="44" r="1.1" fill="#fff"/>`;
      case 'angry': return `<circle cx="${x}" cy="46" r="2.8" fill="${pupil}"/><path d="M${x - 5} ${x < 50 ? 39.5 : 42} L${x + 5} ${x < 50 ? 42 : 39.5}" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>`;
      case 'wink': return `<path d="M${x - 4} 46 Q${x} 42 ${x + 4} 46" fill="none" stroke="${a.extra === 'mask' ? '#fff' : ink}" stroke-width="2.4" stroke-linecap="round"/>`;
      default: return `<circle cx="${x}" cy="45" r="2.9" fill="${pupil}"/><circle cx="${x - 0.9}" cy="44" r=".9" fill="#fff" opacity=".8"/>`;
    }
  };
  const patched = a.extra === 'eyepatch';
  add(eye(41, a.eyes === 'wink' ? 'dots' : a.eyes));
  if (!patched) add(eye(59, a.eyes));
  if (patched) add(`<path d="M30.5 37 L54 42.5" stroke="#111" stroke-width="1.8"/><path d="M64.5 46.5 L71.2 49" stroke="#111" stroke-width="1.8"/><ellipse cx="59" cy="45.5" rx="6.2" ry="5.2" fill="#141414"/><ellipse cx="57.5" cy="44" rx="2" ry="1.2" fill="#fff" opacity=".15"/>`);
  if (a.extra === 'scar') add(`<path d="M37 36.5 L44.5 54" stroke="#b5485a" stroke-width="1.9" stroke-linecap="round"/><path d="M38.5 41.5 L43 40.5 M40 46.5 L44.5 45.5" stroke="#b5485a" stroke-width="1.3" stroke-linecap="round"/>`);
  // nose
  add(`<path d="M49 49 Q50.5 52 52 50.5" fill="none" stroke="${skinDark}" stroke-width="1.6" stroke-linecap="round"/>`);

  // mouth (sits lower and gets a dark backing inside a beard so it always reads)
  const my = beard ? 60 : 57.5;
  const lipBack = beard ? `<ellipse cx="50" cy="${my}" rx="7.5" ry="4" fill="${shade(H, -45)}"/>` : '';
  const M = {
    smile: `<path d="M43.5 ${my - 1} Q50 ${my + 5} 56.5 ${my - 1}" fill="none" stroke="${beard ? '#f3d9cf' : ink}" stroke-width="2.3" stroke-linecap="round"/>`,
    grin: `<path d="M42.5 ${my - 2} Q50 ${my + 8} 57.5 ${my - 2} Z" fill="#fff" stroke="${ink}" stroke-width="1.8" stroke-linejoin="round"/><path d="M44 ${my} L56 ${my}" stroke="#d8d8d8" stroke-width="1"/>`,
    flat: `<path d="M44 ${my + 0.5} L56 ${my + 0.5}" stroke="${beard ? '#f3d9cf' : ink}" stroke-width="2.3" stroke-linecap="round"/>`,
    open: `<ellipse cx="50" cy="${my + 0.5}" rx="4.4" ry="4.6" fill="#5a1d24" stroke="${ink}" stroke-width="1.6"/><ellipse cx="50" cy="${my + 2.6}" rx="2.6" ry="1.6" fill="#e0707f"/>`,
    smirk: `<path d="M44 ${my + 0.5} Q52 ${my + 1.5} 57 ${my - 3}" fill="none" stroke="${beard ? '#f3d9cf' : ink}" stroke-width="2.3" stroke-linecap="round"/>`,
  };
  add(lipBack + (M[a.mouth] || M.smile));
  if (beard) add(`<path d="M40.5 56.6 C43.5 52.6 47.5 53.3 50 55.2 C52.5 53.3 56.5 52.6 59.5 56.6 C56 57.6 53 56.9 50 57.8 C47 56.9 44 57.6 40.5 56.6 Z" fill="${shade(H, -18)}"/>`);

  // ---- hair (front) — full style, or the under-hat variant
  if (!covered) { if (hair.front) add(`<path d="${hair.front}" fill="${H}"/>`); }
  else if (hair.under) add(`<path d="${hair.under}" fill="${H}"/>`);
  // subtle hair highlight
  if (!covered && hair.front && a.hair !== 'mohawk') add(`<path d="M37 ${hair.capY + 1} Q44 ${hair.capY - 3.5} 52 ${hair.capY - 1.5}" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="2" stroke-linecap="round"/>`);

  // ---- headgear, fitted to the hair silhouette
  if (hg === 'crown') {
    const y = hair.capY, w = Math.max(12, Math.min(hair.capHalf, 18)) * 0.92, h = 15;
    add(`<path d="M${50 - w} ${y} L${50 - w - 1} ${y - h + 3} L${50 - w / 2} ${y - h + 8} L50 ${y - h} L${50 + w / 2} ${y - h + 8} L${50 + w + 1} ${y - h + 3} L${50 + w} ${y} Q50 ${y + 2.5} ${50 - w} ${y} Z" fill="#f2c14e" stroke="#a67c1b" stroke-width="1.3" stroke-linejoin="round"/>`);
    add(`<path d="M${50 - w + 0.5} ${y - 3} Q50 ${y - 0.5} ${50 + w - 0.5} ${y - 3}" fill="none" stroke="#a67c1b" stroke-width="1.2"/>`);
    add(`<circle cx="50" cy="${y - 4}" r="2.3" fill="#e03c5a"/><circle cx="${50 - w / 2 - 1}" cy="${y - 4.3}" r="1.5" fill="#3aa0ff"/><circle cx="${50 + w / 2 + 1}" cy="${y - 4.3}" r="1.5" fill="#3aa0ff"/>`);
    add(`<circle cx="${50 - w - 1}" cy="${y - h + 3}" r="1.6" fill="#ffe08a"/><circle cx="50" cy="${y - h}" r="1.8" fill="#ffe08a"/><circle cx="${50 + w + 1}" cy="${y - h + 3}" r="1.6" fill="#ffe08a"/>`);
  } else if (hg === 'halo' && !haloBehind) {
    add(haloRing(hair.top - 6, 15, 4.2));
  } else if (hg === 'horns') {
    // grow from the sides of the head, through any hair
    add(`<path d="M34.5 33.5 C26 31 21.5 21 24.5 9 C27.5 17.5 33 23.5 40.5 27.5 Z" fill="#ece2d0" stroke="#9a8f7c" stroke-width="1.2" stroke-linejoin="round"/>`);
    add(`<path d="M65.5 33.5 C74 31 78.5 21 75.5 9 C72.5 17.5 67 23.5 59.5 27.5 Z" fill="#ece2d0" stroke="#9a8f7c" stroke-width="1.2" stroke-linejoin="round"/>`);
    add(`<path d="M28 24 L33.5 25.5 M26.5 18.5 L31 20 M72 24 L66.5 25.5 M73.5 18.5 L69 20" stroke="#b9ad97" stroke-width="1"/>`);
  } else if (hg === 'wizard') {
    add(`<path d="M30.5 27 C36 17 44 6 58 -1 C61 -2.5 63 -1 62 2 C60 10 64 19 69.5 27 Z" fill="#4b36a0"/>`);
    add(`<path d="M58 -1 C61 -2.5 63 -1 62 2 C60 10 64 19 69.5 27 L64 27 C59 18 57 9 58 -1 Z" fill="#3b2a7a"/>`);
    add(`<ellipse cx="50" cy="28" rx="27" ry="5" fill="#3b2a7a"/><path d="M32 25.5 Q50 29.5 68 25.5" stroke="#ffd166" stroke-width="2.2" fill="none"/>`);
    add(`<path d="M51 12.5 l1.2 2.6 2.8 .3 -2.1 1.9 .6 2.8 -2.5 -1.4 -2.5 1.4 .6 -2.8 -2.1 -1.9 2.8 -.3 Z" fill="#ffd166"/><circle cx="43" cy="20" r="1.3" fill="#ffd166"/><circle cx="58" cy="6" r="1" fill="#ffd166"/>`);
  } else if (hg === 'helmet') {
    add(`<path d="M27.3 45 C26.5 24 37 15.5 50 15.5 C63 15.5 73.5 24 72.7 45 L67 45 L66.5 37 C61 34.8 39 34.8 33.5 37 L33 45 Z" fill="#8f99a8" stroke="#5c6573" stroke-width="1.4" stroke-linejoin="round"/>`);
    add(`<path d="M50 15.5 L50 35" stroke="#6d7684" stroke-width="2.2"/><path d="M47.8 35 L52.2 35 L51.4 48 L48.6 48 Z" fill="#7c8696" stroke="#5c6573" stroke-width="1"/>`);
    add(`<path d="M33 22 Q41 18 46 18.5" stroke="#fff" stroke-opacity=".35" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="30.5" cy="40" r="1.2" fill="#5c6573"/><circle cx="69.5" cy="40" r="1.2" fill="#5c6573"/>`);
  } else if (hg === 'hood') {
    add(`<path d="M25.5 58 C22.5 30 34.5 17.5 50 17.5 C65.5 17.5 77.5 30 74.5 58 C73.5 38 64.5 27 50 27 C35.5 27 26.5 38 25.5 58 Z" fill="${shade(a.outfit, -8)}"/>`);
    add(`<path d="M27 55 C25.5 33 36 21 50 21" fill="none" stroke="${shade(a.outfit, 25)}" stroke-width="1.4" opacity=".6"/>`);
    add(`<path d="M25.5 58 C24 66 30 73 37 74.5 L63 74.5 C70 73 76 66 74.5 58 C72 66 63 71 50 71 C37 71 28 66 25.5 58 Z" fill="${shade(a.outfit, -8)}"/>`);
  }

  const fc = FRAME_COLORS[a.frame];
  const frame = fc ? (a.frame === 'prismatic'
    ? `<defs><linearGradient id="pg${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6ad5"/><stop offset=".5" stop-color="#6ad5ff"/><stop offset="1" stop-color="#b0ff6a"/></linearGradient></defs><rect x="2" y="2" width="96" height="96" rx="17" fill="none" stroke="url(#pg${uid})" stroke-width="4"/>`
    : `<rect x="2" y="2" width="96" height="96" rx="17" fill="none" stroke="${fc}" stroke-width="4"/>`) : '';
  return `<svg class="avatar-svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="avatar"><clipPath id="ac${uid}"><rect width="100" height="100" rx="18"/></clipPath><g clip-path="url(#ac${uid})">${P.join('')}</g>${frame}</svg>`;
}
