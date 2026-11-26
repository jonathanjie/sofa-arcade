import { mountButton } from '../../phone/controls.mjs';

export function mountTapRacePhone(root, { input }) {
  root.innerHTML = `<div class="party-phone-meter">
    <label for="race-distance">Finish line <output id="race-count"></output></label>
    <progress id="race-distance" max="40" value="0"></progress>
  </div><div class="party-control-zone"></div>`;
  const progress = root.querySelector('progress');
  const count = root.querySelector('output');
  const button = mountButton(root.querySelector('.party-control-zone'), { label: 'Tap!', onPress: () => input({ kind: 'tap' }) });
  return {
    update(state, enabled) {
      if (state) {
        if (progress.max !== state.target) progress.max = state.target;
        if (progress.value !== state.distance) progress.value = state.distance;
        const label = `${state.distance} / ${state.target}`;
        if (count.textContent !== label) count.textContent = label;
      }
      button.setEnabled(enabled);
    },
    dispose() { button.dispose(); root.replaceChildren(); },
  };
}
