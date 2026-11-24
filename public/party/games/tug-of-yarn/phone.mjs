import { mountButton } from '../../phone/controls.mjs';
import { HIT_WINDOW_MS, PERFECT_MS, TEAMS, beatsFor, closestBeat, timingGrade } from './rhythm.mjs';

const FEEDBACK_MS = 600;
const PRACTICE_INTERVAL_MS = 800;
const RING_START_SCALE = 1.86;
const SYNC_RETRY_MS = 100;

export function mountTugOfYarnPhone(root, { input, serverNow }) {
  root.innerHTML = '<div class="tug-pad-zone"></div>';
  const style = root.ownerDocument.createElement('link');
  style.rel = 'stylesheet';
  style.href = new URL('./phone.css', import.meta.url).href;
  root.prepend(style);
  const zone = root.querySelector('.tug-pad-zone');
  const button = mountButton(zone, { label: 'Tap on the beat', onPress: event => {
    if (event.detail === 0) press();
  } });
  const pad = zone.querySelector('button');
  pad.dataset.tugPad = '';
  pad.innerHTML = `<span class="tug-team"></span>
    <span class="tug-dial" aria-hidden="true"><span class="tug-ring"></span><span class="tug-target"></span></span>
    <strong class="tug-action" aria-hidden="true">TAP</strong>
    <output class="tug-grade"></output>`;
  pad.addEventListener('pointerdown', event => {
    if (event.isPrimary && event.button === 0) press();
  });
  const team = pad.querySelector('.tug-team');
  const ring = pad.querySelector('.tug-ring');
  const grade = pad.querySelector('.tug-grade');
  const action = pad.querySelector('.tug-action');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let state;
  let round;
  let mode;
  let practiceStart;
  let pressedBeat;
  let shownBeat;
  let animation;
  let timer;
  let feedbackTimer;

  function clearFeedback() {
    clearTimeout(feedbackTimer);
    grade.textContent = '';
    pad.dataset.grade = '';
  }

  function feedback(text) {
    clearTimeout(feedbackTimer);
    grade.textContent = text;
    pad.dataset.grade = text;
    feedbackTimer = setTimeout(clearFeedback, FEEDBACK_MS);
  }

  function rhythm() {
    if (mode === 'idle') return { label: 'READY' };
    if (mode === 'practice') {
      const elapsed = performance.now() - practiceStart;
      const nearest = Math.max(1, Math.round(elapsed / PRACTICE_INTERVAL_MS));
      const beat = nearest * PRACTICE_INTERVAL_MS;
      return { elapsed, beat, following: beat + PRACTICE_INTERVAL_MS, preceding: beat - PRACTICE_INTERVAL_MS };
    }
    const now = serverNow();
    if (now === null) return { label: 'SYNCING' };
    const elapsed = now - state.a - state.s;
    if (elapsed < 0) return { label: 'NEXT HEAT', resumeIn: -elapsed };
    const beats = beatsFor(state.r);
    const index = closestBeat(elapsed, beats);
    return { elapsed, beat: beats[index], following: beats[index + 1], preceding: beats[index - 1] };
  }

  function press() {
    if (pad.disabled) return;
    const { elapsed, beat, label } = rhythm();
    if (label || pressedBeat === beat) return;
    const result = timingGrade(Math.abs(beat - elapsed));
    if (result !== 'Miss') {
      if (mode === 'play' && !input({ kind: 'tap', at: state.s + Math.round(elapsed) })) return;
      pressedBeat = beat;
    }
    feedback(result);
  }

  function stopRing() {
    clearTimeout(timer);
    animation?.cancel();
    animation = null;
    shownBeat = undefined;
  }

  function paintRhythm() {
    clearTimeout(timer);
    const { elapsed, beat, following, preceding, label, resumeIn } = rhythm();
    button.setEnabled(!label);
    if (label) {
      pad.dataset.window = 'rest';
      if (action.textContent !== label) action.textContent = label;
      if (label === 'SYNCING' || resumeIn !== undefined) timer = setTimeout(paintRhythm, Math.ceil(resumeIn ?? SYNC_RETRY_MS));
      return;
    }
    const delta = elapsed - beat;
    const approachingNext = delta > HIT_WINDOW_MS;
    const next = approachingNext ? following : beat;
    const last = approachingNext ? beat : preceding;
    const from = last ? last + HIT_WINDOW_MS : 0;
    const step = Math.abs(delta) <= PERFECT_MS ? 'perfect' : Math.abs(delta) <= HIT_WINDOW_MS ? 'good' : 'wait';
    pad.dataset.window = step;
    if (action.textContent !== 'TAP') action.textContent = 'TAP';
    if (next !== shownBeat) {
      animation?.cancel();
      animation = null;
      shownBeat = next;
      if (next !== undefined && !motion.matches) {
        animation = ring.animate([{ transform: `scale(${RING_START_SCALE})` }, { transform: 'scale(1)' }],
          { duration: next - from, fill: 'both' });
      }
    }
    if (animation) {
      animation.currentTime = Math.max(0, Math.min(next - from, elapsed - from));
      if (elapsed < from || elapsed >= next) animation.pause();
      else animation.play();
    }

    const boundaries = [next - HIT_WINDOW_MS, next - PERFECT_MS, next + PERFECT_MS + 1, next + HIT_WINDOW_MS + 1];
    const boundary = boundaries.find(at => at > elapsed);
    if (boundary !== undefined) timer = setTimeout(paintRhythm, Math.ceil(boundary - elapsed));
  }

  function labelTeam() {
    const instruction = motion.matches ? 'tap when the target lights' : 'tap when the rings meet';
    const label = mode === 'practice' ? `Practice · ${instruction}`
      : state ? `Team ${TEAMS[state.b].name} · ${instruction}` : '';
    if (team.textContent !== label) team.textContent = label;
  }

  function motionChanged() {
    stopRing();
    labelTeam();
    paintRhythm();
  }
  motion.addEventListener('change', motionChanged);

  return {
    practiceWhileWaiting: true,
    update(next, active, { practice = false, round: nextRound } = {}) {
      const nextMode = practice ? 'practice' : active && next ? 'play' : 'idle';
      if (nextMode !== mode || next?.s !== state?.s || nextRound !== round) {
        stopRing();
        clearFeedback();
        pressedBeat = undefined;
        if (nextMode === 'practice') practiceStart = performance.now();
      }
      pad.dataset.team = next ? String(next.b) : '';
      pad.toggleAttribute('data-practice', nextMode === 'practice');
      mode = nextMode;
      state = next;
      round = nextRound;
      labelTeam();
      paintRhythm();
    },
    dispose() {
      stopRing();
      clearFeedback();
      motion.removeEventListener('change', motionChanged);
      button.dispose();
      root.replaceChildren();
    },
  };
}
