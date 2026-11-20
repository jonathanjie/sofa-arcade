/**
 * Deterministic, offline preview renderer. No audio device, live AudioContext,
 * scheduler, network, third-party sample, or runtime dependency is used.
 *
 * Mirrors ui/audio.js's oscillator vocabulary, envelope shapes, lowpass cutoffs,
 * and quiet 75 ms reflection. Browser PeriodicWave/filter implementations and
 * the shared DynamicsCompressor can differ; this is an inspectable approximation,
 * not a bit-exact capture of the production shared Web Audio graph.
 *
 * node ui/media/odd-laws-society/audio-preview.mjs --verify   (no files written)
 * node ui/media/odd-laws-society/audio-preview.mjs --write    (WAVs + evidence)
 * Add --encode to --write for compact MP3s plus decoded checks (needs ffmpeg).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SCORE, eventsForBar } from './score.mjs';
import { eventsForEffect } from './effects.mjs';

const SAMPLE_RATE = 32000;
const BEAT_SECONDS = 60 / SCORE.bpm;
const TAIL_SECONDS = .6;
const MUSIC_BUS = .7;
const DEFAULT_VOLUME = .45;
const EFFECTS_BUS = .75;
const MODE_NAMES = ['play', ...SCORE.scenes];
const EFFECT_NAMES = ['build', 'coin', 'influence', 'street', 'seal', 'reveal', 'stamp', 'festival', 'win', 'tie'];
const OUTPUT = new URL('./audio-evidence/', import.meta.url);
const waveLength = 8192;
const reedWave = new Float64Array(waveLength);
const harmonicWeights = [0, 1, .14, .19, .045, .035, .01, .015];
let wavePeak = 0;
for (let i = 0; i < waveLength; i++) {
  for (let harmonic = 1; harmonic < harmonicWeights.length; harmonic++) {
    reedWave[i] += harmonicWeights[harmonic] * Math.sin(i * 2 * Math.PI * harmonic / waveLength);
  }
  wavePeak = Math.max(wavePeak, Math.abs(reedWave[i]));
}
for (let i = 0; i < waveLength; i++) reedWave[i] /= wavePeak;

function lowpass(cutoff, q = 1) {
  const omega = 2 * Math.PI * cutoff / SAMPLE_RATE;
  const alpha = Math.sin(omega) / (2 * q);
  const cosine = Math.cos(omega);
  const a0 = 1 + alpha;
  const b0 = (1 - cosine) / 2 / a0;
  const b1 = (1 - cosine) / a0;
  const b2 = b0;
  const a1 = -2 * cosine / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
  return input => {
    const output = b0 * input + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = input; y2 = y1; y1 = output;
    return output;
  };
}
const expRamp = (a, b, time, length) => a * (b / a) ** Math.min(1, Math.max(0, time / length));
function envelope(time, duration, level, lead) {
  const attack = lead ? Math.min(.045, duration * .18) : .014;
  if (time <= attack) return expRamp(.0001, Math.max(.0002, level), time, attack);
  if (!lead) return expRamp(level, .0001, time - attack, duration - attack);
  const bodyAt = Math.min(duration * .4, .15);
  const releaseAt = Math.max(bodyAt + .01, duration - .085);
  if (time < bodyAt) return expRamp(level, level * .88, time - attack, bodyAt - attack);
  if (time < releaseAt) return level * .88;
  return expRamp(level * .88, .0001, time - releaseAt, duration + .015 - releaseAt);
}
function oscillator(phase, instrument) {
  const cycle = phase - Math.floor(phase);
  if (instrument === 'woodwind') {
    const at = cycle * waveLength;
    const integer = Math.floor(at);
    const fraction = at - integer;
    return reedWave[integer] * (1 - fraction) + reedWave[(integer + 1) % waveLength] * fraction;
  }
  if (instrument === 'bell') return Math.sin(2 * Math.PI * cycle);
  return cycle < .25 ? 4 * cycle : cycle < .75 ? 2 - 4 * cycle : 4 * cycle - 4;
}
function addVoice(mix, leadSend, event, atSeconds, kind = 'music') {
  const start = Math.round(atSeconds * SAMPLE_RATE);
  const duration = event.duration * BEAT_SECONDS;
  const count = Math.ceil((duration + .035) * SAMPLE_RATE);
  const frequency = 440 * 2 ** ((event.pitch - 69) / 12);
  const lead = event.instrument === 'woodwind';
  const cutoff = event.instrument === 'bass' ? 1200 : lead ? 3100 : event.instrument === 'pizzicato' ? 1900 : 4200;
  const filter = lowpass(cutoff);
  for (let sample = 0; sample < count && start + sample < mix.length; sample++) {
    const time = sample / SAMPLE_RATE;
    const value = filter(oscillator(time * frequency, event.instrument)) * envelope(time, duration, event.level, lead);
    mix[start + sample] += value;
    if (lead && kind === 'music') leadSend[start + sample] += value * .07;
  }
  if (event.instrument === 'bell') {
    const count = Math.ceil((Math.min(duration, .2) + .02) * SAMPLE_RATE);
    for (let sample = 0; sample < count && start + sample < mix.length; sample++) {
      const time = sample / SAMPLE_RATE;
      const gain = time <= .01
        ? expRamp(.0001, event.level * .18, time, .01)
        : expRamp(event.level * .18, .0001, time - .01, Math.min(duration, .18) - .01);
      mix[start + sample] += Math.sin(2 * Math.PI * frequency * 2 * time) * gain;
    }
  }
}
function reflect(mix, leadSend) {
  const delaySamples = Math.round(.075 * SAMPLE_RATE);
  const delayed = new Float64Array(mix.length);
  const filter = lowpass(2400);
  for (let sample = delaySamples; sample < mix.length; sample++) {
    const value = filter(leadSend[sample - delaySamples] + delayed[sample - delaySamples] * .1);
    delayed[sample] = value;
    mix[sample] += value;
  }
}
function measurements(samples, gain = 1) {
  let peak = 0; let sum = 0; let squares = 0; let clipped = 0; let nonFinite = 0;
  for (const sample of samples) {
    const value = sample * gain;
    if (!Number.isFinite(value)) nonFinite++;
    peak = Math.max(peak, Math.abs(value));
    sum += value;
    squares += value * value;
    if (Math.abs(value) >= 1) clipped++;
  }
  const rms = Math.sqrt(squares / samples.length);
  const rounded = value => Number(value.toFixed(8));
  return {
    peak: rounded(peak), peakDbFS: rounded(20 * Math.log10(peak)),
    rms: rounded(rms), rmsDbFS: rounded(20 * Math.log10(rms)),
    dcOffset: rounded(sum / samples.length), clippedSamples: clipped, nonFiniteSamples: nonFinite,
  };
}
function pcmWav(samples, gain) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24); buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buffer.writeInt16LE(Math.round(Math.min(1, Math.max(-1, samples[i] * gain)) * 32767), 44 + i * 2);
  return buffer;
}
function timeline(mode) {
  const events = [];
  for (let bar = 0; bar < SCORE.bars.length; bar++) {
    for (const event of eventsForBar(bar, mode)) events.push({ ...event, atSeconds: (bar * SCORE.beatsPerBar + event.beat) * BEAT_SECONDS });
  }
  return events;
}
function render(events, durationSeconds, kind = 'music') {
  const samples = new Float64Array(Math.ceil((durationSeconds + TAIL_SECONDS) * SAMPLE_RATE));
  const leadSend = new Float64Array(samples.length);
  for (const event of events) addVoice(samples, leadSend, event, event.atSeconds, kind);
  if (kind === 'music') reflect(samples, leadSend);
  return samples;
}
const sha = buffer => createHash('sha256').update(buffer).digest('hex');
function inspect(samples, label, bus) {
  const raw = measurements(samples);
  if (raw.nonFiniteSamples || raw.clippedSamples || raw.peak >= .6 || raw.rms <= .003 || Math.abs(raw.dcOffset) > .0005) {
    throw new Error(`${label} failed render safety/level checks: ${JSON.stringify(raw)}`);
  }
  return { sourceMix: raw, volume100: measurements(samples, bus), defaultVolume45: measurements(samples, bus * DEFAULT_VOLUME) };
}

const write = process.argv.includes('--write');
const encode = process.argv.includes('--encode');
if (encode && !write) throw new Error('--encode must accompany --write.');
if (!write && !process.argv.includes('--verify')) {
  throw new Error('Use --verify (read-only render check) or --write (WAVs and evidence).');
}
if (write) await mkdir(new URL('wav/', OUTPUT), { recursive: true });
const scoreSource = await readFile(new URL('./score.mjs', import.meta.url));
const effectSource = await readFile(new URL('./effects.mjs', import.meta.url));
const rendererSource = await readFile(new URL('./audio-preview.mjs', import.meta.url));
const report = {
  schemaVersion: 1,
  title: SCORE.title,
  methodology: 'Deterministic oscillator/envelope/filter approximation of ui/audio.js. No compressor, limiter, loudness normalization, audio device, or human audition. Headroom measured before and after the shared music/effects bus gains.',
  sampleRate: SAMPLE_RATE, channels: 1, pcmBits: 16,
  scoreSeconds: SCORE.bars.length * SCORE.beatsPerBar * BEAT_SECONDS,
  releaseTailSeconds: TAIL_SECONDS,
  previewVolume: 1, defaultSharedVolume: DEFAULT_VOLUME, musicBusGain: MUSIC_BUS, effectsBusGain: EFFECTS_BUS,
  sourceSha256: { score: sha(scoreSource), effects: sha(effectSource), renderer: sha(rendererSource) },
  modes: {}, effects: {},
  auditoryEvaluation: 'Not performed. Preview rendering, numerical signal analysis and browser playback checks are distinct from listening.',
};
for (const mode of MODE_NAMES) {
  const events = timeline(mode);
  const samples = render(events, report.scoreSeconds);
  report.modes[mode] = { eventCount: events.length, ...inspect(samples, mode, MUSIC_BUS) };
  if (write && (mode === 'play' || mode === 'council')) {
    const wave = pcmWav(samples, MUSIC_BUS);
    const file = `lala-calls-the-house-${mode}.wav`;
    await writeFile(new URL(`wav/${file}`, OUTPUT), wave);
    report.modes[mode].pcmWavSha256 = sha(wave);
  }
  console.log(`${mode}: ${events.length} events; source peak ${report.modes[mode].sourceMix.peakDbFS} dBFS; preview RMS ${report.modes[mode].volume100.rmsDbFS} dBFS; zero clipped samples`);
}
const effectEvents = [];
let effectCursor = .5;
for (const name of EFFECT_NAMES) {
  const events = eventsForEffect(name);
  const duration = Math.max(...events.map(event => event.beat + event.duration)) * BEAT_SECONDS;
  const samples = render(events.map(event => ({ ...event, atSeconds: event.beat * BEAT_SECONDS })), duration, 'effects');
  report.effects[name] = { atSecondsInPreview: Number(effectCursor.toFixed(2)), ...inspect(samples, name, EFFECTS_BUS) };
  effectEvents.push(...events.map(event => ({ ...event, atSeconds: effectCursor + event.beat * BEAT_SECONDS })));
  effectCursor += duration + 1.1;
}
if (write) {
  const samples = render(effectEvents, effectCursor, 'effects');
  const wave = pcmWav(samples, EFFECTS_BUS);
  await writeFile(new URL('wav/civic-effects.wav', OUTPUT), wave);
  report.effectsPreview = { durationSeconds: samples.length / SAMPLE_RATE, pcmWavSha256: sha(wave), ...inspect(samples, 'effects preview', EFFECTS_BUS) };
  if (encode) {
    report.encodedPreviews = {};
    report.encoder = execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' }).split('\n')[0];
    for (const name of ['lala-calls-the-house-play', 'lala-calls-the-house-council', 'civic-effects']) {
      const input = fileURLToPath(new URL(`wav/${name}.wav`, OUTPUT));
      const output = fileURLToPath(new URL(`${name}.mp3`, OUTPUT));
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-map_metadata', '-1', '-codec:a', 'libmp3lame', '-b:a', '80k', output]);
      const file = await readFile(output);
      const decoded = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', output, '-f', 'f32le', '-ar', String(SAMPLE_RATE), '-ac', '1', 'pipe:1'], { maxBuffer: 32 * 1024 * 1024 });
      const samples = new Float32Array(decoded.buffer, decoded.byteOffset, decoded.length / 4);
      const measured = measurements(samples);
      if (measured.nonFiniteSamples || measured.clippedSamples || measured.peak >= .6) throw new Error(`Encoded ${name} exceeded headroom`);
      report.encodedPreviews[`${name}.mp3`] = { bytes: file.length, sha256: sha(file), decodedSeconds: samples.length / SAMPLE_RATE, decodedMeasurements: measured };
    }
  }
  await writeFile(new URL('render-report.json', OUTPUT), JSON.stringify(report, null, 2) + '\n');
  console.log(`Wrote WAVs and report to ${fileURLToPath(OUTPUT)}`);
}
console.log('PASS: seven complete arrangements and ten effects render with finite samples and conservative headroom.');
