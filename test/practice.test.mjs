import assert from 'node:assert/strict';
import test from 'node:test';
import { practiceMatch } from '../public/assets/practice.js';

test('free practice accepts new launches during and after a live battle', () => {
  let state, frame;
  const game = practiceMatch(message => {
    if (message.type === 'state') state = message.state;
    if (message.type === 'frame') frame = message.frame;
  });
  game.step();
  assert.equal(state.phase, 'ready');
  assert.equal(frame, undefined);

  game.launch(0, 0);
  game.step();
  const firstRound = frame.roundId;
  assert.ok(frame.t > 0);
  game.launch(1, 25);
  assert.notEqual(frame.roundId, firstRound);
  assert.equal(frame.t, 0);
  assert.equal(frame.tops[0].launchPower, 1);
  assert.equal(frame.tops[0].launchTilt, 25 * Math.PI / 180);
  assert.equal(frame.tops[1].launchPower, .5);
  for (let tick = 0; tick < 5000 && !frame.done; tick++) game.step();
  assert.equal(state.phase, 'result');
  assert.equal(state.round.winnerId, frame.winnerId);
  const finishedRound = frame.roundId;
  game.launch(.5, 0);
  assert.notEqual(frame.roundId, finishedRound);
  assert.equal(state.phase, 'running');
  assert.ok(frame.tops.every(top => top.alive));
  assert.equal(frame.t, 0);
});
