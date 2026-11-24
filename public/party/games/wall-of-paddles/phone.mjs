import { mountSlide } from '../../phone/controls.mjs';
import { TEAMS } from './art.mjs';

const PRACTICE_POSITIONS = [-0.66, 0.66, 0, 0.66, -0.66, 0];

export function mountWallOfPaddlesPhone(root, { input }) {
  root.innerHTML = `<strong data-paddle-team></strong><div data-paddle-zone>
    <div data-paddle-rail aria-hidden="true"></div>
    <div data-paddle-target hidden aria-hidden="true"></div>
    <div data-paddle-thumb aria-hidden="true"></div>
  </div>`;
  const zone = root.querySelector('[data-paddle-zone]');
  const rail = root.querySelector('[data-paddle-rail]');
  const target = root.querySelector('[data-paddle-target]');
  const thumb = root.querySelector('[data-paddle-thumb]');
  const teamName = root.querySelector('[data-paddle-team]');
  const handset = root.closest('.party-handset');
  const phone = root.closest('.party-phone');
  const priorHandset = handset?.style.background;
  const priorInk = handset?.style.color;
  const priorPhone = phone?.style.background;
  let active = false;
  let practicing = false;
  let practiceHits = 0;
  const slide = mountSlide(zone, {
    label: 'Paddle position',
    onInput(position) {
      if (active) input({ kind: 'slide', position });
      else if (practicing && Math.abs(position - practicePosition()) <= 0.12) {
        practiceHits++;
        showPracticeTarget();
      }
    },
  });
  const slider = zone.querySelector('input');
  slider.setAttribute('aria-orientation', 'vertical');
  Object.assign(zone.style, {
    position: 'relative', height: 'clamp(220px, calc(100svh - 326px), 650px)', overflow: 'hidden',
    borderRadius: '12px', touchAction: 'none', border: '2px solid currentColor', background: '#08141f',
    cursor: 'ns-resize', userSelect: 'none',
  });
  Object.assign(slider.style, {
    position: 'absolute', inset: '0', width: '100%', height: '100%', margin: '0',
    writingMode: 'vertical-lr', direction: 'ltr', pointerEvents: 'none', opacity: '0',
  });
  Object.assign(rail.style, {
    position: 'absolute', inset: '8px 10%', pointerEvents: 'none', opacity: '.55',
    background: 'linear-gradient(90deg, transparent calc(50% - 1px), currentColor 50%, transparent calc(50% + 1px)), repeating-linear-gradient(transparent 0 39px, #accbe135 39px 40px)',
    borderInline: '1px solid currentColor',
  });
  Object.assign(teamName.style, {
    display: 'block', marginBottom: '8px', font: '800 17px ui-monospace, monospace',
    letterSpacing: '.14em', textTransform: 'uppercase',
  });
  Object.assign(thumb.style, {
    position: 'absolute', top: '50%', left: '50%', width: '68%', height: '42px',
    transform: 'translate(-50%, -50%)', pointerEvents: 'none', borderRadius: '4px',
    background: 'var(--phone-look, #eef7ff)', borderBlock: '4px solid currentColor', boxShadow: '0 0 22px #e3f6ff48',
  });
  Object.assign(target.style, {
    position: 'absolute', left: '9%', width: '82%', height: '54px', transform: 'translateY(-50%)',
    border: '2px dashed #c8f6fc', borderRadius: '7px', background: '#70eefe35', pointerEvents: 'none',
  });
  const practicePosition = () => PRACTICE_POSITIONS[practiceHits % PRACTICE_POSITIONS.length];
  function showPracticeTarget() {
    const position = practicePosition();
    const direction = position < 0 ? 'upper' : position > 0 ? 'lower' : 'middle';
    target.style.top = `${(position + 1) * 50}%`;
    teamName.textContent = `${practiceHits ? `${practiceHits} blocked` : 'Practice'} · ${direction}`;
    slider.setAttribute('aria-description', `Slide to the ${direction} target.`);
  }
  function sync() {
    const range = (slider.valueAsNumber + 1) / 2;
    // Keep the drawn handle fully inside the large native range hit area.
    thumb.style.top = `calc(${range * 100}% + ${21 - range * 42}px)`;
  }
  slider.addEventListener('input', sync);
  slider.addEventListener('focus', () => { zone.style.outline = '3px solid var(--phone-look)'; });
  slider.addEventListener('blur', () => { zone.style.outline = 'none'; });

  // The entire pad steers. The native range remains available to the keyboard and
  // feeds the kit sampler, including mobile browsers that only drag on its thumb.
  let pointer = null;
  function move(event) {
    const box = zone.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientY - box.top) / box.height));
    const prior = slider.value;
    slider.value = String(2 * ratio - 1);
    if (slider.value !== prior) slider.dispatchEvent(new Event('input'));
  }
  zone.addEventListener('pointerdown', event => {
    if (slider.disabled || pointer !== null || event.button !== 0) return;
    pointer = event.pointerId;
    zone.setPointerCapture(pointer);
    move(event);
  });
  zone.addEventListener('pointermove', event => {
    if (event.pointerId === pointer) move(event);
  });
  zone.addEventListener('pointerup', event => {
    if (event.pointerId === pointer) move(event);
  });
  zone.addEventListener('lostpointercapture', event => {
    if (event.pointerId === pointer) pointer = null;
  });

  let team;
  return {
    supportsPractice: true,
    update(state, enabled, practice = false) {
      const canSlide = enabled || practice;
      if ((!canSlide || practicing !== practice) && pointer !== null) {
        if (zone.hasPointerCapture(pointer)) zone.releasePointerCapture(pointer);
        pointer = null;
      }
      if (practicing !== practice) {
        // Discard any sampled practice input before enabling live control.
        slide.setEnabled(false);
        practicing = practice;
        target.hidden = !practice;
        if (practice) {
          practiceHits = 0;
          team = undefined;
          zone.style.color = teamName.style.color = '#c8f6fc';
          if (handset) {
            handset.style.background = '#152638';
            handset.style.color = '#eef7ff';
          }
          if (phone) phone.style.background = '#070e18';
          showPracticeTarget();
        } else {
          slider.removeAttribute('aria-description');
          if (handset) {
            handset.style.background = priorHandset;
            handset.style.color = priorInk;
          }
          if (phone) phone.style.background = priorPhone;
        }
      }
      if (state && team !== state.team && !practice) {
        team = state.team;
        const palette = TEAMS[team];
        teamName.textContent = `${palette.name} team`;
        zone.style.color = teamName.style.color = palette.light;
        if (handset) {
          handset.style.background = palette.dark;
          handset.style.color = '#eef7ff';
        } else zone.style.background = palette.dark;
        if (phone) phone.style.background = '#070e18';
      }
      if (state && !active) {
        slider.value = String(state.position);
        sync();
      }
      active = enabled;
      slide.setEnabled(canSlide);
      zone.style.opacity = canSlide ? '1' : '.7';
    },
    dispose() {
      slide.dispose();
      if (handset) {
        handset.style.background = priorHandset;
        handset.style.color = priorInk;
      }
      if (phone) phone.style.background = priorPhone;
      root.replaceChildren();
    },
  };
}
