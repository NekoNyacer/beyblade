const levels = {
  three: .8, two: .95, one: .85, go: .58, shoot: .92, finish: .8, victory: .9,
  confirm: .3, launch: .55, dash: .48, out: .6,
  'crowd-cheer-short': .13, 'crowd-cheer-medium': .16, 'crowd-applause': .21
};
const crowdFiles = {
  'crowd-cheer-short': 'cheer-short', 'crowd-cheer-medium': 'cheer-medium', 'crowd-applause': 'applause'
};
const metalHits = [
  ['hit', 'ping-light-2', 'ping-light-3'],
  ['ping-mid-1', 'ping-mid-2', 'ping-mid-3'],
  ['heavyHit', 'ping-heavy-2', 'ping-heavy-3']
];
const announcer = new Set(['three', 'two', 'one', 'go', 'shoot', 'finish', 'victory']);
const arenaEffects = new Set(['dash', ...metalHits.flat()]);

export function createBattleAudio() {
  let ctx, output, loading, buffers, voice, crowdVoice, activeEffects = 0;
  const scheduledCall = new Set();
  const lastPlayed = new Map();
  const rotation = metalHits.map(() => ({ remaining: [], last: null }));
  let lastImpact = -Infinity, lastTier = -1;

  async function enable() {
    if (!ctx) {
      ctx = new AudioContext();
      output = ctx.createDynamicsCompressor();
      output.threshold.value = -12;
      output.ratio.value = 4;
      output.connect(ctx.destination);
    }
    await ctx.resume();
    // Decode once, before the round. A late download must never play an old cue.
    loading ??= Promise.all([...Object.keys(levels), ...metalHits.flat()].map(async cue => {
      try {
        const response = await fetch(crowdFiles[cue] ? '/assets/audience/' + crowdFiles[cue] + '.wav' : '/assets/sounds/' + cue + '.wav');
        if (!response.ok) throw new Error('無法載入音效 ' + cue);
        return [cue, await ctx.decodeAudioData(await response.arrayBuffer())];
      } catch (error) {
        if (crowdFiles[cue]) return null; // An optional crowd clip must not disable the announcer.
        throw error;
      }
    })).then(entries => { buffers = new Map(entries.filter(Boolean)); }).catch(error => {
      loading = null;
      throw error;
    });
    await loading;
  }

  function play(cue, { volume = 1, pan = 0, rate = 1, offset = 0, delay = 0, interrupt = false } = {}) {
    const buffer = buffers?.get(cue);
    if (!buffer || offset >= buffer.duration || ctx.state !== 'running' || document.hidden) return false;
    const isCrowd = !!crowdFiles[cue];
    if (isCrowd && crowdVoice) {
      if (!interrupt) return false;
      cancelCrowd();
    }
    const arenaEffect = arenaEffects.has(cue);
    const now = ctx.currentTime;
    // Several tops can hit the same surface in one frame.
    if (arenaEffect && activeEffects >= 5) return false;
    if (!announcer.has(cue) && now - (lastPlayed.get(cue) ?? -Infinity) < .12) return false;
    lastPlayed.set(cue, now);

    const source = ctx.createBufferSource();
    const startAt = now + delay;
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = (levels[cue] ?? 1) * volume;
    source.connect(gain);
    const panner = pan ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(panner);
    }
    (panner || gain).connect(output);
    if (announcer.has(cue)) {
      voice?.stop(startAt);
      voice = source;
    }
    if (cue === 'go' || cue === 'shoot') scheduledCall.add(source);
    if (isCrowd) crowdVoice = { source, gain };
    if (arenaEffect) activeEffects++;
    source.onended = () => {
      scheduledCall.delete(source);
      if (source === voice) voice = null;
      if (source === crowdVoice?.source) crowdVoice = null;
      if (arenaEffect) activeEffects--;
      source.disconnect();
      gain.disconnect();
      panner?.disconnect();
    };
    source.start(startAt, Math.max(0, offset));
    return true;
  }

  function impact(strength, { pan = 0 } = {}) {
    if (!buffers || !Number.isFinite(strength)) return false;
    strength = Math.max(0, Math.min(1, strength));
    const tier = strength < .3 ? 0 : strength < .7 ? 1 : 2;
    const now = ctx.currentTime;
    // Let a hard strike cut through a simultaneous graze in a crowded arena.
    if (now - lastImpact < .12 && tier <= lastTier) return false;

    const group = rotation[tier];
    if (!group.remaining.length) group.remaining.push(...metalHits[tier]);
    const choices = group.remaining.filter(cue => cue !== group.last);
    const cue = choices[Math.floor(Math.random() * choices.length)];
    if (!play(cue, { pan, volume: .42 + .26 * strength })) return false;
    group.remaining.splice(group.remaining.indexOf(cue), 1);
    group.last = cue;
    lastImpact = now;
    lastTier = tier;
    return true;
  }

  function cancelCrowd() {
    if (!crowdVoice) return;
    crowdVoice.gain.gain.setTargetAtTime(.001, ctx.currentTime, .015);
    crowdVoice.source.stop(ctx.currentTime + .08);
    crowdVoice = null;
  }
  document.addEventListener?.('visibilitychange', () => { if (document.hidden) { cancelCrowd(); cancelCall(); } });
  function cancelCall() {
    for (const source of scheduledCall) source.stop();
    scheduledCall.clear();
  }
  return { enable, play, impact, cancelCall, cancelCrowd, get enabled() { return !!buffers && ctx.state === 'running'; } };
}
