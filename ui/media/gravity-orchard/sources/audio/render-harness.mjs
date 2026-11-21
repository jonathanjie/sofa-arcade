/**
 * Development-only browser harness. Runs the UNMODIFIED shared ui/audio.js
 * scheduler and synthesis graph into OfflineAudioContext. A clock facade lets
 * its ordinary 45 ms callback schedule complete bars without waiting in real
 * time. A second output channel taps the shared master before its compressor.
 * This is a numerical offline capture, never evidence of speaker audition.
 */
export async function renderWithSharedScheduler(options) {
  const { SCORE, eventsForBar, eventsForEffect } = await import('../../score.mjs');
  const sampleRate = options.sampleRate ?? 32000;
  const beatSeconds = 60 / SCORE.bpm;
  const barSeconds = SCORE.beatsPerBar * beatSeconds;
  const loops = options.loops ?? 2;
  const scoreSeconds = SCORE.bars.length * barSeconds;
  const durationSeconds = options.durationSeconds ?? (.045 + scoreSeconds * loops + .65);
  let clock = 0;
  let intervalCallback = null;
  let intervalStarts = 0;
  let contextsCreated = 0;
  let graph;
  let compressor;
  let outputSink;
  let rawSink;
  const voices = [];
  const scheduledBars = [];
  const scheduledEffects = [];
  const OriginalOfflineAudioContext = window.OfflineAudioContext;

  window.AudioContext = class {
    constructor() {
      contextsCreated++;
      graph = new OriginalOfflineAudioContext(2, Math.ceil(durationSeconds * sampleRate), sampleRate);
      const merge = graph.createChannelMerger(2);
      outputSink = graph.createGain();
      rawSink = graph.createGain();
      outputSink.connect(merge, 0, 0);
      rawSink.connect(merge, 0, 1);
      merge.connect(graph.destination);
      return new Proxy({}, {
        get(_target, key) {
          if (key === 'currentTime') return clock;
          if (key === 'state') return 'running';
          if (key === 'destination') return outputSink;
          if (['resume', 'suspend', 'close'].includes(key)) return () => Promise.resolve();
          if (key === 'onstatechange') return null;
          if (key === 'createDynamicsCompressor') return () => { compressor = graph.createDynamicsCompressor(); return compressor; };
          if (key === 'createGain') return () => {
            const node = graph.createGain();
            const connect = node.connect.bind(node);
            node.connect = (destination, ...rest) => {
              if (destination === compressor) connect(rawSink);
              return connect(destination, ...rest);
            };
            return node;
          };
          if (key === 'createOscillator') return () => {
            const node = graph.createOscillator();
            const voice = { start: null, stop: null };
            const start = node.start.bind(node);
            const stop = node.stop.bind(node);
            node.start = at => { voice.start = at; voices.push(voice); start(at); };
            node.stop = at => { voice.stop = at; stop(at); };
            return node;
          };
          const value = graph[key];
          return typeof value === 'function' ? value.bind(graph) : value;
        },
        set() { return true; }, // Ignore state callbacks; the offline graph owns no live clock.
      });
    }
  };
  window.setInterval = callback => { intervalCallback = callback; intervalStarts++; return 1; };
  window.clearInterval = () => { intervalCallback = null; };
  const { audio } = await import('/ui/audio.js');
  audio.setScore('gravity-orchard', {
    SCORE,
    eventsForBar(index, scene) {
      const events = eventsForBar(index, scene);
      scheduledBars.push({ index, scene, events });
      return events;
    },
    eventsForEffect(name) {
      const events = eventsForEffect(name);
      scheduledEffects.push({ name, atSeconds: clock + .01, events });
      return events;
    },
  });
  const isPhone = options.role === 'player';
  const music = options.kind !== 'effects';
  audio.setContext({ role: isPhone ? 'player' : 'host', view: music ? 'practice' : 'collection', scoreScene: options.scene ?? 'stage1' });
  audio.setVolume(options.volume ?? 1);
  audio.setMusic(true);
  // Deliberately keep the default quiet phoneEffects preference in phone tests.
  if (!isPhone) audio.setEffects(true);
  const contextsBeforeUnlock = contextsCreated;
  const unlocked = await audio.unlock();
  if (!unlocked) throw new Error('Offline shared scheduler did not unlock.');
  if (music && !isPhone) {
    const totalBars = SCORE.bars.length * loops;
    for (let ordinal = 1; ordinal < totalBars; ordinal++) {
      clock = .045 + ordinal * barSeconds - .16;
      for (const request of options.sceneRequests ?? []) if (request.beforeBar === ordinal) {
        audio.setContext({ scoreScene: request.scene });
      }
      if (!intervalCallback) throw new Error('Shared scheduler lost its interval.');
      intervalCallback();
    }
    if (scheduledBars.length !== totalBars) throw new Error(`Expected ${totalBars} scheduled bars, found ${scheduledBars.length}.`);
  }
  for (const request of options.effects ?? []) {
    clock = request.atSeconds;
    audio.effect(request.name);
  }
  const buffer = await graph.startRendering();
  const output = buffer.getChannelData(0);
  const raw = buffer.getChannelData(1);
  const round = value => Number(value.toFixed(9));
  function measure(samples) {
    let peak = 0, squares = 0, sum = 0, clipped = 0, nonFinite = 0;
    for (const sample of samples) {
      if (!Number.isFinite(sample)) nonFinite++;
      peak = Math.max(peak, Math.abs(sample));
      squares += sample * sample;
      sum += sample;
      if (Math.abs(sample) >= 1) clipped++;
    }
    const rms = Math.sqrt(squares / samples.length);
    return { peak: round(peak), peakDbFS: peak > 0 ? round(20 * Math.log10(peak)) : null,
      rms: round(rms), rmsDbFS: rms > 0 ? round(20 * Math.log10(rms)) : null,
      dcOffset: round(sum / samples.length), clippedSamples: clipped, nonFiniteSamples: nonFinite };
  }
  const edges = voices.flatMap(({ start, stop }) => [{ time: start, delta: 1 }, { time: stop, delta: -1 }]).sort((a, b) => a.time - b.time || a.delta - b.delta);
  let concurrent = 0, maxConcurrentOscillators = 0;
  for (const edge of edges) { concurrent += edge.delta; maxConcurrentOscillators = Math.max(concurrent, maxConcurrentOscillators); }
  const loopSeams = [];
  if (music && !isPhone) for (let loop = 1; loop < loops; loop++) {
    const time = .045 + loop * scoreSeconds;
    const sample = Math.round(time * sampleRate);
    const before = raw.subarray(sample - Math.round(.15 * sampleRate), sample);
    loopSeams.push({ atSeconds: time, preCompressorSampleJump: round(Math.abs(raw[sample] - raw[sample - 1])), quietTail: measure(before) });
  }
  const result = {
    userAgent: navigator.userAgent,
    sampleRate, durationSeconds: output.length / sampleRate, contextsBeforeUnlock, contextsCreated, intervalStarts,
    scheduledBars: scheduledBars.map(({ index, scene, events }) => ({ index, scene, eventCount: events.length })),
    eventCount: scheduledBars.reduce((count, { events }) => count + events.length, 0),
    scheduledEffects: scheduledEffects.map(({ name, atSeconds, events }) => ({ name, atSeconds, eventCount: events.length })),
    oscillatorCount: voices.length, maxConcurrentOscillators,
    preCompressor: measure(raw), output: measure(output), loopSeams,
    settings: audio.getSettings(),
  };
  if (options.capture) {
    const seconds = options.captureSeconds ?? (.045 + scoreSeconds);
    const samples = output.subarray(0, Math.min(output.length, Math.round(seconds * sampleRate)));
    const bytes = new Uint8Array(44 + samples.length * 2);
    const data = new DataView(bytes.buffer);
    const text = (offset, value) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); };
    text(0, 'RIFF'); data.setUint32(4, bytes.length - 8, true); text(8, 'WAVEfmt ');
    data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
    data.setUint32(24, sampleRate, true); data.setUint32(28, sampleRate * 2, true);
    data.setUint16(32, 2, true); data.setUint16(34, 16, true); text(36, 'data'); data.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) data.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
    let binary = '';
    for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
    result.wavBase64 = btoa(binary);
    result.captureSeconds = samples.length / sampleRate;
  }
  return result;
}
