const mix = (a, b, t) => a + (b - a) * t;

// Sample only authoritative snapshots. Discrete state changes occur at their event time.
export function sampleFrames(frames, time) {
  if (!frames.length) return null;
  const target = Math.max(frames[0].t, Math.min(frames.at(-1).t, time));
  let before = frames[0], after = before;
  for (const frame of frames) {
    if (frame.t <= target) before = frame;
    if (frame.t >= target) { after = frame; break; }
    after = frame;
  }
  const fraction = after.t > before.t ? (target - before.t) / (after.t - before.t) : 0;
  const previous = new Map(before.tops.map(top => [top.id, top]));
  const tops = after.tops.map(top => {
    const from = previous.get(top.id) || top, value = { ...(fraction < 1 ? from : top) };
    const elimination = (after.events || []).find(event => event.id === top.id &&
      (event.type === 'out' || event.type === 'ringout') && event.t > before.t && event.t <= after.t);
    const topFraction = elimination ? Math.min(1, (target - before.t) / (elimination.t - before.t)) : fraction;
    for (const key of ['x', 'z', 'spin', 'energy', 'vx', 'vz', 'pocketDepth', 'y', 'vy', 'tilt', 'angularSpeed']) {
      const endpoint = elimination && (key === 'x' || key === 'z') && Number.isFinite(elimination[key]) ? elimination[key] : top[key];
      if (Number.isFinite(from[key]) && Number.isFinite(endpoint)) value[key] = mix(from[key], endpoint, topFraction);
    }
    const entering=(after.events||[]).find(event=>event.id===top.id&&event.type==='pocket'&&event.phase==='enter'&&event.t>before.t);
    if(entering&&Number.isFinite(top.pocketDepth))value.pocketDepth=target<entering.t?0:top.pocketDepth*Math.max(0,Math.min(1,(target-entering.t)/(after.t-entering.t||1)));
    for (const event of after.events || []) {
      if (event.id !== top.id || event.t <= before.t || event.t > target + 1e-8) continue;
      if (event.type === 'rail') {
        value.railActive = event.phase === 'enter'; value.railDir = event.direction ?? value.railDir;
      } else if (event.type === 'pocket') {
        value.pocketActive = event.phase === 'enter'; value.pocketIndex = value.pocketActive ? event.pocketIndex : null;
        if (!value.pocketActive) value.pocketDepth = 0;
      } else if (event.type === 'ringout' || event.type === 'out') {
        value.alive = false; value.outReason = event.type === 'ringout' ? 'ringout' : top.outReason;
      }
    }
    return value;
  });
  return { ...before, t: target, tops, events: [] };
}

// Simulation timestamps are seconds; receive/render clocks are milliseconds.
export class FrameTimeline {
  constructor({ delay = .1 } = {}) { this.delay = delay; this.reset(); }
  reset() {
    this.frames = []; this.pending = []; this.seen = new Set();
    this.receivedAt = 0; this.renderTime = -Infinity; this.pausedAt = null; this.frozen = null;
  }
  setPaused(paused, now) {
    if (paused && this.pausedAt === null) {
      this.frozen = sampleFrames(this.frames, Number.isFinite(this.renderTime) ? this.renderTime : this.frames[0]?.t); this.pausedAt = now;
      if (this.frozen) this.frozen = { ...this.frozen, events: [] };
    }
    if (!paused && this.pausedAt !== null) {
      this.receivedAt += now - this.pausedAt; this.pausedAt = null; this.frozen = null;
    }
  }
  push(frame, now) {
    if (!frame || !Number.isFinite(frame.t) || !Array.isArray(frame.tops)) return false;
    const latest = this.frames.at(-1);
    if (latest && frame.roundId !== latest.roundId) this.reset();
    else if (latest && frame.t <= latest.t) return false;
    this.frames.push(frame); this.receivedAt = this.pausedAt ?? now;
    for (const [index, event] of (frame.events || []).entries()) {
      const key = event.eventId ?? `${frame.t}:${index}:${event.type}`;
      if (this.seen.has(key)) continue;
      this.seen.add(key); this.pending.push({ ...event, t: event.t ?? frame.t });
    }
    this.pending.sort((a, b) => a.t - b.t);
    if (this.pending.length > 512) this.pending.splice(0, this.pending.length - 512);
    if (this.seen.size > 4096) this.seen = new Set([...this.seen].slice(-2048));
    if (this.frames.length > 16) this.frames.splice(0, this.frames.length - 16);
    return true;
  }
  sample(now) {
    if (this.pausedAt !== null && this.frozen) return { ...this.frozen, events: [] };
    if (!this.frames.length) return null;
    const latest = this.frames.at(-1), clock = this.pausedAt ?? now;
    const target = Math.min(latest.t, Math.max(this.frames[0].t, this.renderTime,
      latest.t - this.delay + Math.max(0, clock - this.receivedAt) / 1000));
    this.renderTime = target;
    while (this.frames.length > 2 && this.frames[1].t <= target) this.frames.shift();
    const frame = sampleFrames(this.frames, target);
    while (this.pending.length && this.pending[0].t <= target + 1e-8) {
      const event = this.pending.shift();
      // Never deliver a wall of obsolete impact sounds after a suspended tab.
      if (target - event.t <= .25) frame.events.push(event);
    }
    return frame;
  }
}

// A replay reads the same snapshots at reduced speed. It never predicts a flight or a winner.
export class RingoutReplay {
  constructor(frames, event) {
    this.event = event;
    this.frames = frames.filter(frame => frame.roundId === frames.at(-1)?.roundId && frame.t >= event.t - 1);
    this.start = Math.max(this.frames[0]?.t ?? event.t, event.t - .65);
    this.end = Math.min(this.frames.at(-1)?.t ?? event.t, event.t + .12);
    this.duration = 2.4; this.rate = .35; this.previousTime = this.start - 1e-7;
    const seen = new Set();
    this.events = this.frames.flatMap(frame => (frame.events || []).map((event, index) => ({ ...event,
      t: event.t ?? frame.t, eventId: event.eventId ?? `${frame.t}:${index}:${event.type}` })))
      .filter(event => !seen.has(event.eventId) && seen.add(event.eventId)).sort((a,b) => a.t-b.t);
  }
  sample(elapsed) {
    const time = Math.min(this.end, this.start + Math.max(0, elapsed) * this.rate);
    const frame = sampleFrames(this.frames, time);
    if (!frame) return null;
    frame.events = this.events.filter(event => event.t > this.previousTime && event.t <= time + 1e-8);
    this.previousTime = time;
    return frame;
  }
}

// Send every crossed sample, including accumulated events, after a delayed animation tick.
export class FrameCursor {
  constructor(frames) { this.frames = frames; this.reset(); }
  reset() { this.index = -1; this.time = -Infinity; }
  advance(time) {
    const reset = time < this.time;
    if (reset) this.reset();
    this.time = time;
    const frames = [];
    while (this.index + 1 < this.frames.length && this.frames[this.index + 1].t <= time + 1e-8) {
      frames.push(this.frames[++this.index]);
    }
    return { reset, frames };
  }
}
