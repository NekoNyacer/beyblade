const numberSounds = { '3': 'three', '2': 'two', '1': 'one' };

export function launchCue(phase, shootAt, now) {
  const remaining = shootAt - now;
  if (!Number.isFinite(remaining)) return '';
  if (phase === 'countdown' && remaining > 0 && remaining <= 3000) return String(Math.ceil(remaining / 1000));
  if (['countdown', 'shoot', 'running'].includes(phase) && remaining <= 0 && remaining > -1200) return 'SHOOT!';
  return '';
}

export function createLaunchAudio(sound) {
  let lastNumber, calledRound, launchedRound;
  return (state, now) => {
    if (!state?.round || !['countdown', 'shoot', 'running'].includes(state.phase)) {
      if (calledRound) sound.cancelCall();
      lastNumber = calledRound = launchedRound = null;
      return;
    }
    const { id, shootAt, startsAt } = state.round;
    const remaining = shootAt - now;
    const cue = launchCue(state.phase, shootAt, now);
    if (numberSounds[cue] && lastNumber !== id + cue && sound.play(numberSounds[cue])) lastNumber = id + cue;

    if (state.round.launchResumed) return;

    // Schedule both syllables on the audio clock. A delayed render cannot stretch GO.
    if (calledRound !== id && remaining <= 750 && remaining >= -350) {
      const untilShoot = Math.max(0, remaining / 1000);
      // The repaired GO is 500ms. Skip it on a late join instead of chopping a word.
      if (remaining >= 500) sound.play('go', { delay: untilShoot - .5 });
      if (sound.play('shoot', { delay: untilShoot })) calledRound = id;
    }
    if (state.phase === 'running' && launchedRound !== id && now >= startsAt && now - startsAt <= 350) {
      if (shootAt == null) sound.play('shoot'); // A free-practice pull has no countdown.
      if (sound.play('launch', { volume: .3 })) launchedRound = id;
    }
  };
}
