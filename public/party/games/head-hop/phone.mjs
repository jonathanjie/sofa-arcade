import { mountButton } from '../../phone/controls.mjs';
import { instruction } from './tv.mjs';

export function mountPhone(root, { input }) {
  root.innerHTML = '<p></p><div class="party-control-zone"></div>';
  const status = root.querySelector('p');
  let start = null;
  const control = mountButton(root.lastElementChild, { label: 'Hop!', onPress() {
    const held = start === null ? 0 : performance.now() - start;
    input({ kind: 'hop', power: Math.min(10, Math.round(held / 60)) });
    start = null;
  } });
  const button = root.querySelector('button');
  function charge() {
    start ??= performance.now();
  }
  button.addEventListener('pointerdown', charge);
  button.addEventListener('pointercancel', () => { start = null; });
  button.addEventListener('keydown', event => {
    if (event.key === ' ' || event.key === 'Enter') charge();
  });
  return {
    update(s, enabled) {
      control.setEnabled(Boolean(enabled && s?.lives));
      if (!enabled) start = null;
      status.textContent = enabled && s ? s.score + (s.score === 1 ? ' point' : ' points') + ' · ' + s.lives + (s.lives === 1 ? ' life' : ' lives') + ' · ×' + s.chain : instruction;
      const demo = Math.floor(performance.now() / 500) % 3;
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const gesture = still ? '↓ Hold  ↑ Release' : ['↓ Press', '● Hold', '↑ Release'][demo];
      button.textContent = enabled ? 'Hop!' : gesture;
    },
    dispose() { control.dispose(); root.replaceChildren(); },
  };
}
