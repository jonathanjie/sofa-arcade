import { mountButton } from '../../phone/controls.mjs';

export function mountPhone(root, { input }) {
  const status = document.createElement('p');
  const demo = document.createElement('canvas');
  demo.width = 220;
  demo.height = 60;
  demo.setAttribute('aria-label', 'Tap when both planks line up');
  root.append(status, demo);
  const control = mountButton(root, { label: 'Your drop!', onPress: () => input({ kind: 'tap' }) });
  const button = root.querySelector('button');
  return {
    update(state, enabled) {
      const active = enabled && state?.q === 0;
      control.setEnabled(active);
      demo.hidden = enabled;
      if (!enabled) {
        const ctx = demo.getContext('2d');
        ctx.fillStyle = '#fffaf0';
        ctx.fillRect(0, 0, 220, 60);
        ctx.fillStyle = '#141414';
        ctx.fillRect(70, 40, 80, 12);
        ctx.fillStyle = '#fcd34d';
        const beat = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : Math.sin(performance.now() / 350);
        ctx.fillRect(70 + beat * 48, Math.abs(beat) < .25 ? 27 : 8, 80, 12);
      }
      status.textContent = enabled ? 'Score · ' + (state?.s ?? 0) : 'Tap when the plank lines up.';
      button.textContent = active ? 'Your drop!' : enabled ? 'In ' + state?.q + (state?.q === 1 ? ' turn' : ' turns') : 'Tap ↓';
      button.setAttribute('aria-label', button.textContent);
    },
    dispose() { control.dispose(); root.replaceChildren(); },
  };
}
