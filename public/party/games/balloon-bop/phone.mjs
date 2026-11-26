import { mountButton } from '../../phone/controls.mjs';

export function mountPhone(root, { input }) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./phone.css', import.meta.url).href;
  const status = document.createElement('p');
  root.append(link, status);
  const control = mountButton(root, { label: 'Tap a spot to hop there', onPress(event) {
    const box = pad.getBoundingClientRect();
    const fraction = event.detail ? (event.clientX - box.left) / box.width : .5;
    input({ kind: 'hop', x: Math.round(1000 * Math.max(0, Math.min(1, fraction))) });
  } });
  const pad = root.querySelector('button');
  pad.classList.add('bop-pad');
  return { update(state, enabled) {
    control.setEnabled(enabled);
    pad.classList.toggle('bop-teach', !enabled);
    status.textContent = !enabled ? 'Tap a spot to hop there and bop the balloon.' :
      state.t < 0 ? state.b + ' bops · Team ' + state.s + ' · ' + state.l + ' lives'
        : (state.t ? 'Right' : 'Left') + ' team · ' + state.s + ' points · ' + state.b + ' bops';
  }, dispose() { control.dispose(); root.replaceChildren(); } };
}
