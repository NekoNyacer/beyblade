// Keep the least-delayed sample; queued state messages must not move the countdown backward.
export function serverClockOffset(previous, serverTime, receivedAt = Date.now()) {
  return Math.max(previous ?? -Infinity, serverTime - receivedAt);
}
