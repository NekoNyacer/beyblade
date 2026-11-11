import { LauncherPreview } from './parts.js';
import { setLauncherKit, sizeWinder } from './launcher.js';
import { appendRipcordEvent, measureRipcord } from './ripcord.js';

export function createLauncher(ripcord, { canPull, canHold = canPull, onPull }) {
  ripcord.innerHTML = `
    <div class="launcher-top" aria-hidden="true"><div id="loaded-top"></div></div>
    <img class="launcher-body" data-part="body" src="/assets/launcher-body.svg" alt="" draggable="false">
    <div class="cord-assembly">
      <img class="cord-strip" data-part="rack" src="/assets/launcher-rack.svg" alt="" draggable="false">
      <button id="handle" type="button" aria-label="握住拉環向右抽到底；鍵盤按 Enter 或空白鍵發射" aria-disabled="true">
        <img data-part="loop" src="/assets/launcher-loop.svg" alt="" draggable="false">
      </button>
    </div>`;
  const handle = ripcord.querySelector('#handle');
  const preview = new LauncherPreview(ripcord.querySelector('#loaded-top'));
  const landscape = matchMedia('(orientation: landscape)');
  const enabled = () => landscape.matches && canPull();
  let gesture, stroke = 0;

  function resize() {
    stroke = sizeWinder(ripcord);
  }

  function cancel(resetPull = true) {
    const previous = gesture;
    gesture = null;
    if (previous && handle.hasPointerCapture(previous.id)) handle.releasePointerCapture(previous.id);
    ripcord.classList.remove('dragging');
    if (resetPull) ripcord.style.setProperty('--pull', '0px');
  }

  function sync() {
    const armed = enabled();
    handle.setAttribute('aria-disabled', String(!armed));
    ripcord.classList.toggle('active', armed);
    if (armed && gesture && !gesture.armed) {
      gesture.armed = true;
      gesture.points = [{x: gesture.start, y: gesture.startY, t: performance.now()}];
    }
  }

  handle.addEventListener('pointerdown', event => {
    if (!landscape.matches || !canHold() || gesture || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    resize();
    gesture = {id: event.pointerId, start: event.clientX, startY: event.clientY, armed: canPull(), points: [], stroke};
    appendRipcordEvent(gesture.points, event);
    handle.setPointerCapture(event.pointerId);
    ripcord.classList.add('dragging');
  });

  function move(event) {
    if (!gesture || gesture.id !== event.pointerId) return;
    if (!enabled()) {
      gesture.start = event.clientX;
      gesture.startY = event.clientY;
      gesture.points = [];
      appendRipcordEvent(gesture.points, event);
      return;
    }
    appendRipcordEvent(gesture.points, event);
    const distance = Math.max(0, Math.min(gesture.stroke, event.clientX - gesture.start));
    ripcord.style.setProperty('--pull', distance + 'px');
    const result = measureRipcord(gesture.points, gesture.stroke);
    if (result.accepted) {
      onPull(result.power, result.angle);
      navigator.vibrate?.(18);
    }
  }

  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', event => {
    move(event);
    if (gesture?.id === event.pointerId) cancel();
  });
  for (const type of ['pointercancel', 'lostpointercapture']) {
    handle.addEventListener(type, event => { if (gesture?.id === event.pointerId) cancel(); });
  }
  handle.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && !event.repeat && enabled()) {
      event.preventDefault();
      onPull(.5, 0);
    }
  });
  handle.addEventListener('click', event => { if (event.detail === 0 && enabled()) onPull(.5, 0); });
  window.addEventListener('resize', () => { cancel(); resize(); });
  landscape.addEventListener('change', () => { cancel(); resize(); sync(); });

  return {
    resize, sync, cancel,
    setParts(parts, color) {
      setLauncherKit(ripcord, color);
      preview.set(parts, color);
    },
    release() { cancel(false); ripcord.classList.add('released'); },
    reset() { cancel(); ripcord.classList.remove('released'); },
  };
}
