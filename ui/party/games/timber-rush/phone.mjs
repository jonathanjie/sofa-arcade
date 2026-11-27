// Side-tap input adapted from goofyfish/public/games/chopping.html (MIT, © Kamran Ahmed).
import { mountButton } from '../../phone/controls.mjs';

export function mountTimberPhone(root, { input }) {
  root.innerHTML =
    '<section class="timber-phone"><p class="timber-status"></p><div class="timber-pad"></div><aside>Tap the side clear of the lowest branch.<div class="timber-demo" aria-label="Example: branch on right, tap left">☞　←　│╱</div></aside></section>';
  const sheet = document.createElement('link');
  sheet.rel = 'stylesheet';
  sheet.href = new URL('./phone.css', import.meta.url).href;
  root.prepend(sheet);
  const pad = root.querySelector('.timber-pad');
  const controls = [-1, 1].map((side) =>
    mountButton(pad, {
      label: side < 0 ? '← Left' : 'Right →',
      onPress: () => input({ kind: 'chop', side }),
    }),
  );
  return {
    update(state, active) {
      for (const button of controls) button.setEnabled(active && !state?.d);
      root.querySelector('aside').hidden = !!state && !state.teach;
      const cue = state?.d
        ? 'Recovering…'
        : state?.b === 1
          ? 'Cut left ←'
          : state?.b === -1
            ? 'Cut right →'
            : 'Either side';
      root.querySelector('.timber-status').textContent =
        (state?.s ?? 0) + (state?.s === 1 ? ' log · ' : ' logs · ') + cue;
    },
    dispose() {
      root.replaceChildren();
    },
  };
}
