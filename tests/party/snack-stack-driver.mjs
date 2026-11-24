import {
  GREEN_CENTRE, PICTURE_ANGLE, PREVIEW_MS, QUICK_TAP_TARGET, TRACE,
  cheeseAngle, cheeseHalfWidth, greenPosition, lalaLooks,
} from '../../ui/party/games/snack-stack/cards.mjs';

export function inputsForCard(scene, seat = 0) {
  const { card, variant, elapsed, index, difficulty } = scene;
  const at = elapsed - PREVIEW_MS;
  if (scene.phase !== 'play') return [];
  const pace = seat % 5 * 50;
  function send(kind, value = 0) { return [{ kind, value, at, slot: index }]; }
  function once(time, kind, value) { return at === time + pace ? send(kind, value) : []; }
  function repeat(start, interval, count, kind, valueAt) {
    const passed = at - start - pace;
    if (passed < 0 || passed >= interval * count || passed % interval !== 0) return [];
    return send(kind, valueAt?.(passed / interval));
  }
  switch (card) {
    case 0: return repeat(200, 150, 7, 'tap');
    case 1: return repeat(200, 100, QUICK_TAP_TARGET, 'tap');
    case 2: return [...once(300, 'down'), ...once(3300 + seat % 3 * 50, 'up')];
    case 3: return [...once(300, 'down'),
      ...((at > 550 + pace && Math.abs(greenPosition(at, variant) - GREEN_CENTRE) < 6) ? send('up') : [])];
    case 4: return repeat(200, 150, 6, 'tap');
    case 5: return repeat(350, 50, 9, 'axis', () => -PICTURE_ANGLE[variant]);
    case 6: return [...once(200, 'trace-start', TRACE[0]),
      ...repeat(400, 200, TRACE.length - 1, 'point', point => TRACE[point + 1])];
    case 7: return once(500, 'choose', variant);
    case 8: return at > 250 + pace && (cheeseAngle(at, variant) < cheeseHalfWidth(difficulty) / 2
      || cheeseAngle(at, variant) > 360 - cheeseHalfWidth(difficulty) / 2) ? send('tap') : [];
    case 9: return once(900, 'choose', 3 + variant);
    case 10: return at > 200 + pace && at % 100 === 0 && !lalaLooks(at, variant, difficulty) ? send('tap') : [];
    case 11: return once(600, 'choose', variant);
    default: throw new Error('Unknown Snack Stack card');
  }
}
