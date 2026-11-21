/** Public, data-only Odd Laws Society catalog (v0.2 and v0.3). No authority or private state. */
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export const GUILDS = deepFreeze([
  { id: 'commerce', name: 'Commerce', color: '#B77D22', iconKey: 'commerce' },
  { id: 'craft', name: 'Craft', color: '#C56655', iconKey: 'craft' },
  { id: 'civic', name: 'Civic', color: '#397F7C', iconKey: 'civic' },
  { id: 'culture', name: 'Culture', color: '#80577F', iconKey: 'culture' },
]);

const income = { type: 'income', amount: 1 };
const workshop = { type: 'firstBuildDiscount', amount: 1 };
const festival = { type: 'festivalBonus', amount: 1 };
const influence = amount => ({ type: 'influenceOnBuild', amount });
const descriptions = {
  income: '+1 coin at each later income; at most +2 income coins per city.',
  firstBuildDiscount: 'First Build each session costs 1 less, minimum 1; workshops do not stack.',
  festivalBonus: '+1 prestige per Festival; at most +1 Festival prestige per city.',
};
const building = (id, name, term, guild, cost, prestige, ability = null) => ({
  id, name, term, guild, cost, prestige, ability,
  abilityDescription: ability === null ? 'No ability.'
    : ability.type === 'influenceOnBuild' ? `Gain ${ability.amount} influence when built, up to 6.`
      : descriptions[ability.type],
});

/** Exactly eighteen designs; each term opens with two copies of its six designs. */
export const BUILDINGS = deepFreeze([
  building('corner-shop', 'Corner Shop', 1, 'commerce', 3, 1, income),
  building('tea-stall', 'Tea Stall', 1, 'commerce', 2, 2),
  building('button-workshop', 'Button Workshop', 1, 'craft', 3, 2, workshop),
  building('petition-kiosk', 'Petition Kiosk', 1, 'civic', 3, 2, influence(2)),
  building('pocket-theatre', 'Pocket Theatre', 1, 'culture', 3, 2, festival),
  building('community-garden', 'Community Garden', 1, 'culture', 2, 2),
  building('night-market', 'Night Market', 2, 'commerce', 4, 3, income),
  building('clockwork-studio', 'Clockwork Studio', 2, 'craft', 4, 4, workshop),
  building('public-library', 'Public Library', 2, 'civic', 4, 4, influence(2)),
  building('debate-hall', 'Debate Hall', 2, 'civic', 3, 2, influence(3)),
  building('concert-pavilion', 'Concert Pavilion', 2, 'culture', 4, 4, festival),
  building('quilt-bridge', 'Quilt Bridge', 2, 'craft', 3, 3),
  building('grand-bazaar', 'Grand Bazaar', 3, 'commerce', 6, 7),
  building('grand-clock', 'Grand Clock', 3, 'craft', 6, 7),
  building('high-court', 'High Court', 3, 'civic', 5, 5, influence(2)),
  building('observatory', 'Observatory', 3, 'civic', 7, 9),
  building('opera-house', 'Opera House', 3, 'culture', 6, 7, festival),
  building('lala-monument', 'Lala Monument', 3, 'culture', 8, 10),
]);

/**
 * Rules v0.3 adds twelve effect designs. Each term then has ten designs, and each
 * match deals eight of them, one copy each. v0.2 matches never use these.
 */
const streetSynergy = { type: 'streetGuildPrestige', amount: 1 };
const diversity = { type: 'diversityPrestige', amount: 1 };
const rivalFestival = { type: 'rivalFestivalCoin', amount: 1 };
const lobbyCoin = { type: 'lobbyCoin', amount: 1 };
const scoutOnBuild = { type: 'scoutOnBuild', amount: 1 };
const treasuryRate = { type: 'treasuryRate', amount: 2 };
const effectDescriptions = {
  streetGuildPrestige: guild => `+1 prestige for each other ${guild} building in this street.`,
  diversityPrestige: () => '+1 prestige for each guild in your city, at most 4.',
  rivalFestivalCoin: () => 'When your opponent holds a Festival, gain 1 coin.',
  lobbyCoin: () => 'Lobby also gains 1 coin.',
  scoutOnBuild: () => 'When built, draw 1 card into your reserve if it has room.',
  treasuryRate: () => 'Treasury scores 1 prestige per 2 coins, still at most 4.',
};
const guildName = id => GUILDS.find(guild => guild.id === id).name;
const effectBuilding = (id, name, term, guild, cost, prestige, ability) => ({
  id, name, term, guild, cost, prestige, ability, rules: '0.3',
  abilityDescription: effectDescriptions[ability.type](guildName(guild)),
});

export const EFFECT_BUILDINGS = deepFreeze([
  effectBuilding('gossip-stand', 'Gossip Stand', 1, 'commerce', 2, 1, rivalFestival),
  effectBuilding('carpenters-lodge', "Carpenters' Lodge", 1, 'craft', 3, 1, streetSynergy),
  effectBuilding('town-crier', 'Town Crier', 1, 'civic', 2, 1, lobbyCoin),
  effectBuilding('street-musicians', 'Street Musicians', 1, 'culture', 2, 1, scoutOnBuild),
  effectBuilding('counting-house', 'Counting House', 2, 'commerce', 4, 2, treasuryRate),
  effectBuilding('courier-office', 'Courier Office', 2, 'commerce', 3, 2, scoutOnBuild),
  effectBuilding('civic-forum', 'Civic Forum', 2, 'civic', 4, 2, streetSynergy),
  effectBuilding('little-gallery', 'Little Gallery', 2, 'culture', 4, 1, diversity),
  effectBuilding('harbour-exchange', 'Harbour Exchange', 3, 'commerce', 7, 6, streetSynergy),
  effectBuilding('inventors-fair', "Inventors' Fair", 3, 'craft', 5, 4, scoutOnBuild),
  effectBuilding('town-hall', 'Town Hall', 3, 'civic', 6, 5, streetSynergy),
  effectBuilding('grand-museum', 'Grand Museum', 3, 'culture', 6, 4, diversity),
]);

/** Every design either rules version can use, for lookups by design ID. */
export const ALL_BUILDINGS = deepFreeze([...BUILDINGS, ...EFFECT_BUILDINGS]);

/**
 * The designs a match can use in one term. The Grand Market module adds the
 * effect designs; without Back-Room Deals, designs that Scout are left out.
 */
export function termPool({ grandMarket = false, backRoom = false } = {}, term) {
  const designs = grandMarket
    ? ALL_BUILDINGS.filter(design => backRoom || design.ability?.type !== 'scoutOnBuild')
    : BUILDINGS;
  return designs.filter(design => design.term === term);
}

const guildDiscount = guild => ({ type: 'guildDiscount', guild, amount: 2 });
const guildThreshold = guild => ({
  type: 'guildThreshold', guild,
  thresholds: [{ atLeast: 2, points: 1 }, { atLeast: 4, points: 2 }],
});
const law = (id, name, category, description, effect) => ({ id, name, category, description, effect });

/** Neutral defaults are state IDs, not cards and never part of the twelve-law agenda. */
export const LAWS = deepFreeze([
  law('small-shop-supremacy', 'Small-Shop Supremacy', 'economy',
    'Commerce Buildings cost 2 less, minimum 1.', guildDiscount('commerce')),
  law('workshop-week', 'Workshop Week', 'economy',
    'Craft Buildings cost 2 less, minimum 1.', guildDiscount('craft')),
  law('public-grants', 'Public Grants', 'economy',
    'Civic Buildings cost 2 less, minimum 1.', guildDiscount('civic')),
  law('everything-is-art', 'Everything Is Art', 'economy',
    'Culture Buildings cost 2 less, minimum 1.', guildDiscount('culture')),
  law('open-tender', 'Open Tender', 'economy',
    "Each player's first Build per session costs 2 less, minimum 1.", { type: 'firstBuildDiscount', amount: 2 }),
  law('honest-wages', 'Honest Wages', 'economy',
    'Work gains 4 coins instead of 3.', { type: 'workIncome', coins: 4 }),
  law('shop-local', 'Shop Local', 'civic',
    'At session end: 1 prestige for 2–3 Commerce buildings; 2 for 4 or more.', guildThreshold('commerce')),
  law('industrial-pride', 'Industrial Pride', 'civic',
    'At session end: 1 prestige for 2–3 Craft buildings; 2 for 4 or more.', guildThreshold('craft')),
  law('public-service-day', 'Public Service Day', 'civic',
    'At session end: 1 prestige for 2–3 Civic buildings; 2 for 4 or more.', guildThreshold('civic')),
  law('mandatory-applause', 'Mandatory Applause', 'civic',
    'At session end: 1 prestige for 2–3 Culture buildings; 2 for 4 or more.', guildThreshold('culture')),
  law('fashionable-streets', 'Fashionable Streets', 'civic',
    'At session end: 1 prestige per qualifying completed street, at most 2.',
    { type: 'streetCount', pointsEach: 1, cap: 2 }),
  law('diversity-parade', 'Diversity Parade', 'civic',
    'At session end: 1 prestige for three guilds represented; 2 for all four.',
    { type: 'diversityThreshold', thresholds: [{ atLeast: 3, points: 1 }, { atLeast: 4, points: 2 }] }),
]);
