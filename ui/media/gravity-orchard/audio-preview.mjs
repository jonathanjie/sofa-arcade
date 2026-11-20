/** Authoring gallery only. Uses the existing shared graph and preferences. */
import { audio as sharedAudio } from '../../audio.js';
import * as soundtrack from './score.mjs';
import { EFFECT_NAMES } from './events.mjs';

const LABELS = Object.freeze({
  menu: 'Game menu', practice: 'Practice', stage1: 'Morning Delivery',
  stage2: 'Switchback Grove', stage3: 'Moonlight Picnic', paused: 'Paused', celebrate: 'Celebrate',
});

/**
 * Mount a review player. No sound or graph starts on mount. All live playback
 * goes through ui/audio.js; changes reach its next four-bar phrase boundary.
 * dispose stops this preview without disposing the collection's global audio.
 */
export function mountAudioPreview(root, { audio = sharedAudio } = {}) {
  if (!root?.replaceChildren) throw new TypeError('An audio preview root is required.');
  let selectedScene = 'stage1';
  let playing = false;
  let engaged = false;
  let disposed = false;
  let playRequest = 0;
  const controller = new AbortController();
  const settings = audio.getSettings();
  root.classList.add('go-audio-preview');
  root.innerHTML = `
    <header><h3>Over the Little Bridge</h3><p>D major · 4/4 · 104 BPM · 32-bar AABA</p></header>
    <p class="go-audio-note">A returning woodwind melody, plucked chords and a gentle bass. Scene changes settle at the next four-bar phrase.</p>
    <div class="go-audio-controls">
      <label>Arrangement <select data-audio-scene>${soundtrack.SCORE.scenes.map(scene => `<option value="${scene}"${scene === selectedScene ? ' selected' : ''}>${LABELS[scene]}</option>`).join('')}</select></label>
      <button type="button" data-audio-play>Play host music</button>
      <button type="button" data-audio-stop disabled>Stop preview</button>
    </div>
    <fieldset class="go-audio-settings"><legend>Shared sound settings</legend>
      <label><input type="checkbox" data-audio-music${settings.music ? ' checked' : ''}> Music</label>
      <label><input type="checkbox" data-audio-effects${settings.effects ? ' checked' : ''}> Effects</label>
      <label>Volume <input type="range" data-audio-volume min="0" max="100" value="${Math.round(settings.volume * 100)}"><output data-audio-volume-label>${Math.round(settings.volume * 100)}%</output></label>
    </fieldset>
    <p data-audio-status role="status" aria-live="polite">Silent until you press Play or choose a cue. Phone controllers remain quiet by default.</p>
    <div class="go-audio-cues" role="group" aria-label="Sound effect previews">${EFFECT_NAMES.map(name => `<button type="button" data-audio-cue="${name}">${name.replaceAll('-', ' ')}</button>`).join('')}</div>
    <details class="go-audio-recordings"><summary>Rendered recordings and verification</summary>
      <p>These recordings use the existing scheduler and Web Audio graph in an offline browser. Decode and level checks are automated; physical-speaker listening has not been performed.</p>
      <label>Morning Delivery · complete loop<audio controls preload="none" aria-label="Morning Delivery rendered soundtrack" src="${new URL('./sources/audio/previews/over-the-little-bridge-stage1.mp3', import.meta.url).href}"></audio></label>
      <label>Moonlight Picnic · complete loop<audio controls preload="none" aria-label="Moonlight Picnic rendered soundtrack" src="${new URL('./sources/audio/previews/over-the-little-bridge-stage3.mp3', import.meta.url).href}"></audio></label>
      <label>Ten restrained cues<audio controls preload="none" aria-label="Gravity Orchard rendered sound effects" src="${new URL('./sources/audio/previews/orchard-cues.mp3', import.meta.url).href}"></audio></label>
    </details>`;
  const query = selector => root.querySelector(selector);
  const status = message => { if (!disposed) query('[data-audio-status]').textContent = message; };
  const setContext = () => audio.setContext({ role: 'host', view: playing ? 'practice' : 'collection', scoreScene: selectedScene });
  const ensureScore = () => { engaged = true; audio.setScore('gravity-orchard', soundtrack); setContext(); };
  const refresh = () => {
    if (disposed) return;
    const value = audio.getSettings();
    query('[data-audio-music]').checked = value.music;
    query('[data-audio-effects]').checked = value.effects;
    query('[data-audio-volume]').value = String(Math.round(value.volume * 100));
    query('[data-audio-volume-label]').textContent = `${Math.round(value.volume * 100)}%`;
    query('[data-audio-stop]').disabled = !playing;
    query('[data-audio-play]').disabled = playing;
  };
  const unsubscribe = audio.subscribe(refresh);

  function selectScene(value) {
    if (disposed || !soundtrack.SCORE.scenes.includes(value)) return;
    selectedScene = value;
    query('[data-audio-scene]').value = value;
    if (playing) {
      setContext();
      status(`${LABELS[value]} is queued for the next four-bar phrase. The musical clock continues.`);
    }
  }
  function play() {
    if (disposed) return Promise.resolve(false);
    const request = ++playRequest;
    playing = true;
    ensureScore();
    const failed = () => {
      if (disposed || request !== playRequest) return false;
      playing = false;
      setContext();
      refresh();
      status('This browser could not unlock audio. Try Play again or use the rendered recordings.');
      return false;
    };
    let unlocked;
    try { unlocked = audio.unlock(); } // Directly in the gesture; no unrelated await.
    catch { return Promise.resolve(failed()); }
    refresh();
    return Promise.resolve(unlocked).then(ok => {
      if (disposed || request !== playRequest) return false;
      const current = audio.getSettings();
      if (!ok || !current.unlocked || !current.canPlayMusic) return failed();
      status(current.music ? `${LABELS[selectedScene]} is playing on the shared host scheduler.` : 'Shared Music is off. Turn it on to hear the score.');
      return true;
    }, failed);
  }
  function stop() {
    if (disposed) return;
    playRequest++;
    playing = false;
    if (engaged) setContext();
    for (const recording of root.querySelectorAll('audio')) recording.pause();
    refresh();
    status('Preview stopped. Shared sound preferences are preserved.');
  }
  query('[data-audio-scene]').addEventListener('change', event => selectScene(event.target.value), { signal: controller.signal });
  query('[data-audio-play]').addEventListener('click', () => { void play(); }, { signal: controller.signal });
  query('[data-audio-stop]').addEventListener('click', stop, { signal: controller.signal });
  query('[data-audio-music]').addEventListener('change', event => { audio.setMusic(event.target.checked); refresh(); }, { signal: controller.signal });
  query('[data-audio-effects]').addEventListener('change', event => { audio.setEffects(event.target.checked); refresh(); }, { signal: controller.signal });
  query('[data-audio-volume]').addEventListener('input', event => { audio.setVolume(Number(event.target.value) / 100); refresh(); }, { signal: controller.signal });
  for (const button of root.querySelectorAll('[data-audio-cue]')) button.addEventListener('click', () => {
    ensureScore();
    void audio.unlock().then(ok => {
      if (disposed || !ok) return;
      audio.effect(button.dataset.audioCue);
      status(audio.getSettings().effects ? `Previewing ${button.textContent}.` : 'Shared Effects are off. Turn them on to hear the cue.');
    });
  }, { signal: controller.signal });
  for (const recording of root.querySelectorAll('audio')) recording.addEventListener('play', () => {
    playRequest++;
    playing = false;
    ensureScore();
    for (const other of root.querySelectorAll('audio')) if (other !== recording) other.pause();
    refresh();
  }, { signal: controller.signal });
  return Object.freeze({
    play, stop, selectScene,
    getState: () => ({ selectedScene, playing, disposed }),
    dispose() {
      if (disposed) return;
      stop();
      disposed = true;
      controller.abort();
      unsubscribe();
      root.replaceChildren();
    },
  });
}
