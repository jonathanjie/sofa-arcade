/** Private deterministic authoring. Not part of the browser runtime closure. */
export const TYPES = Object.freeze(['apple', 'plum', 'pear', 'starfruit']);
export const RECIPE_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'apple-picnic', needs: Object.freeze({ apple: 2, plum: 0, pear: 1, starfruit: 0 }) }),
  Object.freeze({ id: 'plum-picnic', needs: Object.freeze({ apple: 0, plum: 2, pear: 0, starfruit: 1 }) }),
  Object.freeze({ id: 'sunlit-mix', needs: Object.freeze({ apple: 1, plum: 0, pear: 1, starfruit: 1 }) }),
  Object.freeze({ id: 'moonlit-mix', needs: Object.freeze({ apple: 0, plum: 1, pear: 1, starfruit: 1 }) }),
]);

export function hashSeed(text) {
  let word = 2166136261;
  for (let i = 0; i < text.length; i += 1) word = Math.imul(word ^ text.charCodeAt(i), 16777619) >>> 0;
  return word;
}

export function seededRandom(seed) {
  let word = hashSeed(seed);
  return () => {
    word = (word + 0x6d2b79f5) >>> 0;
    let value = Math.imul(word ^ (word >>> 15), word | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(values, random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export const basketOwner = type => type === 'apple' || type === 'plum' ? 'jon' : 'lydia';

/** Four crossing assignments × 24 permutations = 96 valid layouts per bag. */
export function makeBag(crossLeft, crossRight, order = TYPES) {
  if (!['apple', 'plum'].includes(crossLeft) || !['pear', 'starfruit'].includes(crossRight)
      || order.length !== 4 || new Set(order).size !== 4 || order.some(type => !TYPES.includes(type))) {
    throw new RangeError('A bag must contain all four fruit and one crossing in each direction.');
  }
  return order.map(type => {
    const owner = basketOwner(type);
    const crossing = type === crossLeft || type === crossRight;
    return { type, spawnOwner: crossing ? (owner === 'jon' ? 'lydia' : 'jon') : owner };
  });
}

export function authorStage({ seed, matchId, stageIndex, attempt }) {
  const prefix = `${matchId}:s${stageIndex}:a${attempt}`;
  // Independent streams make supply, recipes and gust rotation insensitive to
  // another feature's random draw count, and identical on a same-seed retry.
  const random = seededRandom(`${seed}:stage:${stageIndex}:supply:v1`);
  const entries = [];
  for (let bag = 0; bag < 6; bag += 1) {
    const left = ['apple', 'plum'][Math.floor(random() * 2)];
    const right = ['pear', 'starfruit'][Math.floor(random() * 2)];
    const layout = makeBag(left, right, shuffle(TYPES, random));
    layout.forEach((entry, slot) => entries.push({
      id: `${prefix}:f${String(entries.length + 1).padStart(2, '0')}`, ...entry, bag, slot,
    }));
  }
  const definitions = stageIndex === 0 ? RECIPE_DEFINITIONS
    : shuffle(RECIPE_DEFINITIONS, seededRandom(`${seed}:stage:${stageIndex}:recipes:v1`));
  return {
    entries,
    recipes: definitions.map(recipe => ({ id: `${prefix}:${recipe.id}`, recipeType: recipe.id, needs: { ...recipe.needs } })),
    gustRotation: Math.floor(seededRandom(`${seed}:stage:${stageIndex}:gust:v1`)() * 4),
  };
}
