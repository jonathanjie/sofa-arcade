const FRUIT_COLOURS = Object.freeze({ apple: '#db6f53', plum: '#9874b4', pear: '#c4cf67', starfruit: '#edc763' });

/** Code-native teaching symbols; final reusable artwork is supplied by GO5. */
export function fruitShape(type) {
  const colour = FRUIT_COLOURS[type] || FRUIT_COLOURS.apple;
  if (type === 'plum') return `<ellipse rx="20" ry="25" fill="${colour}"/><path d="M0-24V-32M0-29Q-16-41-20-27Q-8-22 0-29M1-26Q16-38 20-24Q8-22 1-26" fill="#52774a"/><path d="M-4-16Q-14 0-4 16" fill="none" stroke="#fff3df" stroke-width="3"/>`;
  if (type === 'pear') return `<path d="M-6-23C-14-18-9-10-18 1C-34 22-10 32 4 27C29 25 29 9 17-3C8-14 15-22 4-25Z" fill="${colour}"/><path d="M2-25L6-36M5-31Q22-42 23-28Q12-22 5-31" fill="#52774a"/><circle cx="-10" cy="12" r="2.5" fill="#476447" stroke="none"/><circle cx="1" cy="17" r="2.5" fill="#476447" stroke="none"/>`;
  if (type === 'starfruit') return `<path d="M0-29 9-10 29-9 15 6 19 27 0 17-19 27-15 6-29-9-9-10Z" fill="${colour}"/><path d="M0-17V9M-16-5 9 5M16-5-9 5" fill="none" stroke="#9b6e25" stroke-width="2.5"/>`;
  return `<path d="M0-20C-8-31-28-22-26-5C-24 16-14 30 0 23C15 30 26 14 26-5C26-23 10-30 0-20Z" fill="${colour}"/><path d="M0-21L3-34M3-27Q24-38 22-25Q11-18 3-27" fill="#52774a"/><path d="M-15-10Q-20-2-14 7" fill="none" stroke="#ffe9cf" stroke-width="3"/>`;
}

export function fruitIcon(type) {
  return `<svg viewBox="-38 -43 76 80" aria-hidden="true"><g stroke="#33523d" stroke-width="3" stroke-linejoin="round">${fruitShape(type)}</g></svg>`;
}

function fruit(type, x, y, { selected = false, scale = 0.83 } = {}) {
  return `<g data-tutorial-fruit="${type}" transform="translate(${x} ${y})">${selected ? '<circle r="39" fill="none" stroke="#276e79" stroke-width="4" stroke-dasharray="7 5"/>' : ''}<ellipse cx="1" cy="25" rx="23" ry="7" fill="#244b3320"/><g transform="scale(${scale})" stroke="#33523d" stroke-width="3" stroke-linejoin="round">${fruitShape(type)}</g></g>`;
}

function basket(type, x, y, count = 0, highlight = false) {
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  return `<g transform="translate(${x} ${y})" data-tutorial-basket="${type}" data-count="${count}"><path d="M-43-22Q-43-67 0-67Q43-67 43-22" fill="none" stroke="#946937" stroke-width="10"/><rect x="-54" y="-30" width="108" height="64" rx="12" fill="${highlight ? '#fff3c5' : '#ebd299'}" stroke="${highlight ? '#236d65' : '#805b34'}" stroke-width="${highlight ? 5 : 3}"/><path d="M-46-12H46M-48 10H48M-30-27V30M-10-27V30M10-27V30M30-27V30" stroke="#9e7d4940" stroke-width="2"/><g transform="translate(0 -2) scale(.57)" stroke="#33523d" stroke-width="3">${fruitShape(type)}</g><text class="go-tutorial-svg-small" text-anchor="middle" y="58">${label}</text>${[0, 1, 2].map(n => `<circle cx="${(n - 1) * 24}" cy="79" r="8" fill="${n < count ? FRUIT_COLOURS[type] : '#f8f4da'}" stroke="#5a7450" stroke-width="2"/>`).join('')}</g>`;
}

function gardenBase(prefix, { hazards = false } = {}) {
  return `<defs><pattern id="${prefix}-compost" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="14" height="14" fill="#714f3b"/><rect width="6" height="14" fill="#e9d7a6"/></pattern><marker id="${prefix}-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#24695f"/></marker></defs><rect width="960" height="500" fill="${hazards ? '#d3dfd0' : '#dfead1'}"/><g opacity=".43" fill="#a9c295"><circle cx="20" cy="445" r="60"/><circle cx="940" cy="470" r="74"/><circle cx="25" cy="40" r="55"/><circle cx="930" cy="35" r="45"/></g><path d="M74 110V395H403V110M557 110V395H886V110" stroke="#a87543" stroke-width="16" fill="none" stroke-linecap="round"/><rect x="57" y="105" width="350" height="280" rx="24" fill="#c8dda6" stroke="#917345" stroke-width="6"/><rect x="553" y="105" width="350" height="280" rx="24" fill="#d9dfae" stroke="#917345" stroke-width="6"/><rect x="400" y="206" width="160" height="76" rx="6" fill="#d2b77d" stroke="#927044" stroke-width="4"/><path d="M425 209V279M452 209V279M479 209V279M506 209V279M533 209V279" stroke="#927044" stroke-width="3"/><text x="80" y="77" class="go-tutorial-svg-label">JON · LEFT</text><text x="578" y="77" class="go-tutorial-svg-label">LYDIA · RIGHT</text><text x="480" y="310" class="go-tutorial-svg-small" text-anchor="middle">BRIDGE</text>${hazards ? `<rect x="317" y="320" width="60" height="46" rx="5" fill="url(#${prefix}-compost)" stroke="#614632" stroke-width="4"/><text x="348" y="415" class="go-tutorial-svg-small" text-anchor="middle">COMPOST</text><rect x="473" y="207" width="14" height="74" rx="4" fill="#edc366" stroke="#765e24" stroke-width="4" stroke-dasharray="7 4"/><text x="480" y="351" class="go-tutorial-svg-small" text-anchor="middle">GATE WARNING</text>` : ''}`;
}

export function tutorialGraphic(state, prefix) {
  const step = state.step;
  let art = gardenBase(prefix, { hazards: step === 6 });
  let description = 'Two floating garden trays. Jon steers the left tray and Lydia the right tray, with a bridge between them.';
  if (step === 0) {
    art += basket('apple', 140, 280) + basket('pear', 820, 280);
    art += `<g transform="translate(480 235) rotate(${state.centred ? 0 : -12})"><rect x="-62" y="-104" width="124" height="208" rx="23" fill="#f9f3df" stroke="#335949" stroke-width="7"/><rect x="-46" y="-72" width="92" height="133" rx="10" fill="#c8dec1"/><path d="M-16-89H16" stroke="#335949" stroke-width="5" stroke-linecap="round"/><circle r="21" cy="-6" fill="none" stroke="#4d7a65" stroke-width="3"/><circle r="7" cy="-6" fill="${state.centred ? '#2b7160' : '#b18749'}"/><circle cy="81" r="7" fill="#335949"/></g><text x="480" y="410" class="go-tutorial-svg-state" text-anchor="middle">${state.centred ? 'COMFORTABLE CENTRE ✓' : 'A NATURAL, RELAXED GRIP'}</text>`;
    description = state.centred ? 'The phone is centred at a comfortable resting angle.' : 'A phone held at a comfortable angle above the two gardens. Recenter remembers this resting position.';
  } else if (step === 1) {
    art += basket('apple', 140, 300) + basket('pear', 820, 300);
    art += fruit('apple', state.positions.jon.x, state.positions.jon.y, { selected: state.selected === 'jon' });
    art += fruit('pear', state.positions.lydia.x, state.positions.lydia.y, { selected: state.selected === 'lydia' });
    art += `<text x="235" y="465" class="go-tutorial-svg-caption" text-anchor="middle">${state.moved.jon ? 'JON MOVED ✓' : 'TRY JON’S TRAY'}</text><text x="730" y="465" class="go-tutorial-svg-caption" text-anchor="middle">${state.moved.lydia ? 'LYDIA MOVED ✓' : 'TRY LYDIA’S TRAY'}</text>`;
    description = `${state.selected === 'jon' ? 'Jon' : 'Lydia'} is selected. ${state.moved.jon ? 'Jon’s fruit has moved.' : ''} ${state.moved.lydia ? 'Lydia’s fruit has moved.' : ''}`;
  } else if (step === 2) {
    art += `<path d="M100 244H368" stroke="#97b17f" stroke-width="14" stroke-linecap="round"/><path d="M140 244H340" stroke="#66866a" stroke-width="3" stroke-dasharray="6 7"/>`;
    art += fruit('apple', state.rollX, 224, { selected: state.brakeHeld });
    art += basket('plum', 690, 280) + basket('starfruit', 825, 280);
    art += `<text x="235" y="340" class="go-tutorial-svg-state" text-anchor="middle">${state.brakeHeld ? 'Ⅱ BRAKE HELD' : state.rollDirection > 0 ? '→ ROLLING' : '← ROLLING'}</text><text x="480" y="455" class="go-tutorial-svg-caption" text-anchor="middle">${state.brakeHeld ? 'Less movement. More control.' : 'Hold to steady · release to steer'}</text>`;
    description = state.brakeHeld ? 'Brake is held. The apple is slowing.' : 'An apple rolls along a short teaching track. Hold Brake to slow it.';
  } else if (step === 3) {
    const x = 345 + state.passProgress * 355;
    art += basket('pear', 820, 290);
    art += `<path d="M345 175H700" fill="none" stroke="#24695f" stroke-width="5" stroke-dasharray="8 7" marker-end="url(#${prefix}-arrow)"/>`;
    art += fruit('pear', x, 243, { selected: state.passProgress > .15 && state.passProgress < .65 });
    art += `<text x="480" y="440" class="go-tutorial-svg-state" text-anchor="middle">${state.done ? 'LYDIA RECEIVES ✓' : state.passing ? 'JON → BRIDGE → LYDIA' : 'PASS THE PEAR TO THE RIGHT'}</text>`;
    description = state.done ? 'The pear has crossed the bridge into Lydia’s tray.' : 'The pear starts on Jon’s tray. A right arrow shows its handoff across the bridge to Lydia.';
  } else if (step === 4) {
    art += basket('apple', 140, 280) + basket('plum', 295, 280);
    art += basket('pear', 790, 258, state.basketAttempt === 'pear' ? 1 : 0, true);
    if (state.basketAttempt !== 'pear') art += fruit(state.basketAttempt === 'apple' ? 'apple' : 'pear', state.basketAttempt === 'apple' ? 660 : 625, 225);
    art += `<text x="735" y="430" class="go-tutorial-svg-state" text-anchor="middle">${state.basketAttempt === 'pear' ? 'MATCH ACCEPTED ✓' : state.basketAttempt === 'apple' ? '✕ WRONG SHAPE · BOUNCE BACK' : 'PEAR → PEAR BASKET'}</text>`;
    description = state.basketAttempt === 'pear' ? 'One pear is accepted into the pear basket.' : state.basketAttempt === 'apple' ? 'An apple is rejected from the pear basket and remains on the tray.' : 'The pear basket is highlighted. Choose the fruit with the matching pear shape.';
  } else if (step === 5) {
    const complete = state.deliveries === 3;
    art += basket('apple', 230, 280, complete ? 0 : state.deliveries, true);
    art += basket('pear', 730, 280, 0, true);
    art += `<rect x="332" y="15" width="294" height="89" rx="18" fill="#fff8dc" stroke="#b3c29b" stroke-width="3"/>${fruit('apple', 389, 58, { scale: .64 })}${fruit('apple', 472, 58, { scale: .64 })}${fruit('pear', 556, 58, { scale: .64 })}<text x="480" y="450" class="go-tutorial-svg-state" text-anchor="middle">${complete ? 'ORDER FILLED · BUFFERS EMPTIED ✓' : `${state.deliveries} OF 3 INGREDIENTS IN THE BASKETS`}</text>`;
    description = complete ? 'The shared order used two apples and one pear. The basket buffers are empty again.' : `${state.deliveries} apples wait in the apple basket. The order needs two apples and one pear. Each basket has three buffer places.`;
  } else if (step === 6) {
    const active = state.forecastStarted && state.forecastMs >= 3000 && state.forecastMs < 4500;
    const passed = state.forecastStarted && state.forecastMs >= 4500;
    const seconds = Math.max(1, Math.ceil((3000 - state.forecastMs) / 1000));
    art += `<g transform="translate(780 177)"><path d="M-45-17-35-56-7-31Q5-38 20-28L47-53 50-6Q50 35 4 40Q-45 39-45-17Z" fill="#dba66a" stroke="#845a35" stroke-width="4"/><path d="M-26-3-14-1M17-2 29-4M-6 15 6 15" stroke="#5d4b35" stroke-width="4" stroke-linecap="round"/></g><text x="783" y="244" class="go-tutorial-svg-caption" text-anchor="middle">LALA</text><path d="M366 150H586" stroke="#24695f" stroke-width="8" marker-end="url(#${prefix}-arrow)"/><text x="480" y="123" class="go-tutorial-svg-state" text-anchor="middle">${passed ? 'GUST PASSED →' : active ? 'GUST → RIGHT' : state.forecastStarted ? `GUST → IN ${seconds}` : 'GUST → IN 3'}</text>`;
    art += fruit('starfruit', 190, 230, { selected: state.brakeHeld });
    art += `<text x="480" y="470" class="go-tutorial-svg-caption" text-anchor="middle">${state.braced ? 'Ⅱ BRACED · GUST RESPONSE SOFTENED' : 'WATCH THE ARROW · PREPARE YOUR BRAKE'}</text>`;
    description = `Lala forecasts a gust to the right. ${state.braced ? 'Brake is bracing the tray.' : 'Hold Brake after starting the forecast.'} A striped compost opening is on Jon’s tray. The bridge gate has a dashed warning outline.`;
  } else {
    art += fruit('apple', 235, 215) + fruit('pear', 720, 215);
    const resuming = state.resumeMs !== null;
    const countdown = resuming ? Math.max(1, 3 - Math.floor(state.resumeMs / 1000)) : null;
    art += `<rect x="270" y="150" width="420" height="190" rx="24" fill="#315f50"/><text x="480" y="211" class="go-tutorial-svg-state" text-anchor="middle" style="fill:#fffbea">${state.done ? 'READY TO RETURN ✓' : resuming ? `STARTING IN ${countdown}` : state.paused ? 'Ⅱ SHARED PAUSE' : 'PRACTICE GARDEN'}</text><text x="480" y="262" class="go-tutorial-svg-caption" text-anchor="middle" style="fill:#fffbea">${state.ready.jon ? 'JON ✓' : 'JON · NOT READY'}  ·  ${state.ready.lydia ? 'LYDIA ✓' : 'LYDIA · NOT READY'}</text><text x="480" y="307" class="go-tutorial-svg-small" text-anchor="middle" style="fill:#fffbea">${state.done ? 'Your phones resume the real run.' : 'Both gardeners choose when to continue.'}</text>`;
    description = state.done ? 'Both gardeners are ready and the practice countdown has completed.' : resuming ? `Both gardeners are ready. Practice countdown: ${countdown}.` : state.paused ? `The practice garden is paused. Jon is ${state.ready.jon ? 'ready' : 'not ready'}. Lydia is ${state.ready.lydia ? 'ready' : 'not ready'}.` : 'The private practice garden is running. Pause before asking both gardeners to ready up.';
  }
  return `<svg viewBox="0 0 960 500" role="img" aria-labelledby="${prefix}-graphic-title"><title id="${prefix}-graphic-title">${description}</title>${art}</svg>`;
}
