/**
 * Development-only parameterized offline renderer, adapted from this repository's
 * Odd Laws preview math and inspected ui/audio.js timbres. No device, scheduler,
 * AudioContext, I/O, network or third-party sample. Only the score/effects modules
 * belong in the shipped runtime. This is an approximation, not a Web Audio capture.
 */
export function createOfflineRenderer({ bpm, sampleRate = 32000, tailSeconds = .6 }) {
  if (!Number.isFinite(bpm) || bpm <= 0 || !Number.isInteger(sampleRate) || sampleRate < 16000 || sampleRate > 192000 || !Number.isFinite(tailSeconds) || tailSeconds < 0) throw new RangeError('Invalid render tempo, rate or tail.');
  const SAMPLE_RATE = sampleRate;
  const BEAT_SECONDS = 60 / bpm;
  const TAIL_SECONDS = tailSeconds;
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
  function render(events, durationSeconds, kind = 'music') {
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0) throw new RangeError('Expected a nonnegative duration.');
    for (const event of events) {
      if (![event.pitch, event.atSeconds, event.duration, event.level].every(Number.isFinite) || event.atSeconds < 0 || event.duration <= 0 || event.level <= 0) throw new RangeError('Expected a finite, audible event.');
    }
    const samples = new Float64Array(Math.ceil((durationSeconds + TAIL_SECONDS) * SAMPLE_RATE));
    const leadSend = new Float64Array(samples.length);
    for (const event of events) addVoice(samples, leadSend, event, event.atSeconds, kind);
    if (kind === 'music') reflect(samples, leadSend);
    return samples;
  }
  return Object.freeze({ render, measurements, pcmWav, sampleRate, beatSeconds: BEAT_SECONDS, tailSeconds });
}
