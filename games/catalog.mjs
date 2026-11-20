/** Shared collection metadata. Only games with a registered server engine can create rooms. */
export const SOFA_GAME_ID = 'sofa-kingdoms';
export const ODD_LAWS_GAME_ID = 'odd-laws-society';

export const GAME_CATALOG = Object.freeze([
  { id: SOFA_GAME_ID, title: 'Sofa Kingdoms', tagline: 'Tiny kingdoms. One enormous cat.', description: 'Gather crumbs, race home, and outwit Lala as she rearranges your living-room kingdom.', mode: 'Friendly rivalry', duration: '15–25 min', status: 'playable', accent: '#628b7e', icon: 'paw' },
  { id: 'borrowed-minutes', title: 'Borrowed Minutes', tagline: 'The perfect heist takes a few do-overs.', description: 'Plan a clockwork heist together. Each time loop leaves an echo of your previous moves to help the next attempt.', mode: 'Cooperative heist', duration: '20–30 min', status: 'planned', accent: '#8478a4', icon: 'clock' },
  { id: 'gravity-orchard', title: 'Gravity Orchard', tagline: 'Your next move changes which way is down.', description: 'Grow a strange little orchard, rotate gravity, and send ripe fruit tumbling into your baskets.', mode: 'Tactical rivalry', duration: '15–20 min', status: 'planned', accent: '#a9874d', icon: 'orchard' },
  { id: 'afterglow-market', title: 'Afterglow Market', tagline: 'A little stall. A big night.', description: 'Build a night-market stall, trade curious goods, and guess what the next wave of customers will crave.', mode: 'Trading & strategy', duration: '25–35 min', status: 'planned', accent: '#ad6f65', icon: 'market' },
  { id: ODD_LAWS_GAME_ID, title: 'The Odd Laws Society', tagline: 'Build the city. Rewrite its rules.', description: 'Build a nine-plot borough across six council sessions. Compete for a shared market, seal your influence bids, and shape the laws that score both cities.', mode: 'City-building strategy', duration: '35–45 min target', status: 'playable', accent: '#6d829b', icon: 'laws' },
  { id: 'last-ninety-seconds', title: 'The Last Ninety Seconds', tagline: 'Two witnesses. One missing minute and a half.', description: 'Compare the clues on your phones and reconstruct a tiny mystery together before the scene slips away.', mode: 'Cooperative mystery', duration: '15–25 min', status: 'planned', accent: '#8c7680', icon: 'mystery' },
  { id: 'footprints-at-midnight', title: 'Footprints at Midnight', tagline: 'One of you knows where the footprints lead.', description: 'Slip through a moonlit garden or follow the trail. Your phone keeps your moves secret while the TV reveals the clues.', mode: 'Hidden movement', duration: '20–30 min', status: 'planned', accent: '#657f85', icon: 'moon' },
].map(game => Object.freeze(game)));

export function getGame(id) {
  return GAME_CATALOG.find(game => game.id === id) || null;
}
