import { spinSpeed } from './rail-config.js';

const number = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });

export function rpmValue(top) {
  const angularSpeed = top?.angularSpeed ?? (Number.isFinite(top?.energy) ? spinSpeed(top.energy) : null);
  return Number.isFinite(angularSpeed) ? Math.max(0, angularSpeed) * 60 / (2 * Math.PI) : null;
}

export function rpmText(top) {
  const rpm = rpmValue(top);
  return rpm === null ? '—' : number.format(rpm);
}

// Count only a witnessed fresh launch, using the same simulation clock as the arena.
export function createSpinReadout() {
  let state, roundId, animate = false, completed = false, latestTime = -1;
  const waiting = phase => ['lobby', 'ready', 'countdown', 'shoot'].includes(phase);
  return {
    update(next) {
      const nextId = next.round?.id;
      if (nextId !== roundId) {
        animate = waiting(next.phase) || !!roundId;
        completed = false;
        latestTime = -1;
        roundId = nextId;
      }
      if (waiting(next.phase)) {
        animate = true;
        completed = false;
        latestTime = -1;
      }
      if (next.recovered || next.round?.launchResumed) animate = false;
      state = next;
    },
    text(top, frame, { reducedMotion = false, replaying = false } = {}) {
      if (!state || waiting(state.phase)) return '0';
      if (!top || !frame || frame.roundId !== roundId) return '0';
      const rpm = rpmValue(top);
      if (rpm === null) return '—';
      if (latestTime < 0 && frame.t > .2) completed = true;
      if (frame.t < latestTime - .01 || frame.t >= .48 || replaying || reducedMotion) completed = true;
      latestTime = Math.max(latestTime, frame.t);
      if (!animate || completed || reducedMotion || !top.alive || frame.done || state.phase !== 'running') return number.format(rpm);
      const progress = Math.max(0, Math.min(1, frame.t / .48));
      return number.format(rpm * (1 - (1 - progress) ** 3));
    }
  };
}
