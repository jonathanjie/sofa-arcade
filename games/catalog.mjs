/** Shared collection metadata. Only games with a registered server engine can create rooms. */
export const SOFA_GAME_ID = 'sofa-kingdoms';
export const ODD_LAWS_GAME_ID = 'odd-laws-society';
export const TAP_RACE_GAME_ID = 'tap-race';
export const GRAVITY_ORCHARD_GAME_ID = 'gravity-orchard';

export const GAME_CATALOG = Object.freeze([
  { id: SOFA_GAME_ID, title: 'Sofa Kingdoms', tagline: 'Tiny kingdoms. One enormous cat.', description: 'Gather crumbs, race home, and outwit Lala as she rearranges your living-room kingdom.', mode: 'Friendly rivalry', duration: '15–25 min', status: 'playable', accent: '#628b7e', icon: 'paw' },
  { id: 'borrowed-minutes', title: 'Borrowed Minutes', tagline: 'The perfect heist takes a few do-overs.', description: 'Plan a clockwork heist together. Each time loop leaves an echo of your previous moves to help the next attempt.', mode: 'Cooperative heist', duration: '20–30 min', status: 'planned', accent: '#8478a4', icon: 'clock' },
  { id: GRAVITY_ORCHARD_GAME_ID, title: 'Gravity Orchard', tagline: 'Two gardens. One wonderfully wobbly picnic.', description: 'Tilt your garden, pass fruit across the bridge, and fill Lala’s picnic orders together. A real-time cooperative game for two phone controllers.', mode: 'Real-time cooperation', duration: '6–10 min target', status: 'playable', accent: '#a9874d', icon: 'orchard' },
  { id: TAP_RACE_GAME_ID, title: 'Tap Race', tagline: 'Little feet, fast thumbs.', description: 'Tap to race your mouse across the rug. The first runner over the finish line wins.', mode: '2–16 players', duration: '20 sec rounds', status: 'local-only', category: 'party', accent: '#3e7866', icon: 'race' },
  { id: 'dont-wake-lala', title: "Don't Wake Lala", tagline: 'A sleeping cat. A tempting wedge.', description: 'Hold to tiptoe to the cheese. Let go when Lala looks or slide back to the start.', mode: '2–16 players', duration: '60 sec rounds', status: 'local-only', category: 'party', accent: '#915762', icon: 'paw' },
  { id: 'afterglow-market', title: 'Afterglow Market', tagline: 'A little stall. A big night.', description: 'Build a night-market stall, trade curious goods, and guess what the next wave of customers will crave.', mode: 'Trading & strategy', duration: '25–35 min', status: 'planned', accent: '#ad6f65', icon: 'market' },
  { id: ODD_LAWS_GAME_ID, title: 'The Odd Laws Society', tagline: 'Build the city. Rewrite its rules.', description: 'Build a nine-plot borough across six council sessions. Compete for a shared market, seal your influence bids, and shape the laws that score both cities.', mode: 'City-building strategy', duration: '35–45 min target', status: 'playable', accent: '#6d829b', icon: 'laws' },
  { id: 'last-ninety-seconds', title: 'The Last Ninety Seconds', tagline: 'Two witnesses. One missing minute and a half.', description: 'Compare the clues on your phones and reconstruct a tiny mystery together before the scene slips away.', mode: 'Cooperative mystery', duration: '15–25 min', status: 'planned', accent: '#8c7680', icon: 'mystery' },
  { id: 'footprints-at-midnight', title: 'Footprints at Midnight', tagline: 'One of you knows where the footprints lead.', description: 'Slip through a moonlit garden or follow the trail. Your phone keeps your moves secret while the TV reveals the clues.', mode: 'Hidden movement', duration: '20–30 min', status: 'planned', accent: '#657f85', icon: 'moon' },
].map(game => Object.freeze(game)));

export function getGame(id) {
  return GAME_CATALOG.find(game => game.id === id) || null;
}
