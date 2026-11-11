import {LaunchScreenGate} from './launch-screen.js';
if(new URLSearchParams(location.search).has('scene'))location.replace('/scenarios-diagnostics.html'+location.search);
import { createLauncher } from './horizontal-launcher.js';

const $ = id => document.getElementById(id);
const frame = $('scene-frame');
let ready = false, reloading = false, rearmTimer;
const gate = new LaunchScreenGate({onchange: available => {
  if (!available) launcher.cancel();
  syncControls();
}});
const launcher = createLauncher($('ripcord'), {canPull: () => gate.ready && ready && !reloading, onPull: launch});
launcher.setParts({blade: 0, ratchet: 0, bit: 0}, '#ff486a');
launcher.resize();
gate.setActive(false);

function syncControls() {
  launcher.sync();
  $('practice-start').disabled = !gate.ready || !ready || reloading;
  $('practice-view').disabled = !ready;
  $('sound-toggle').disabled = !ready;
}

function launch(power, angle) {
  if (!gate.ready || !ready || reloading) return;
  reloading = true;
  launcher.release();
  syncControls();
  frame.contentWindow.postMessage({type: 'practice-launch', power, angle}, location.origin);
  $('practice-status').textContent = '已發射。再拉一次即可開始新一局。';
  rearmTimer = setTimeout(() => {
    launcher.reset();
    reloading = false;
    syncControls();
  }, 450);
}

window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
  if (event.data?.type === 'practice-ready') {
    ready = true;
    syncControls();
    $('practice-status').textContent = '握住拉環向右抽到底。拉動的速度與方向決定發射力道及傾角。';
  } else if (event.data?.type === 'practice-error') {
    ready = false;
    syncControls();
    $('practice-status').textContent = '無法載入戰鬥盤，請重新整理。';
  }
});
$('practice-start').onclick = () => launch(.5, 0);
$('practice-reset').onclick = () => {
  ready = false;
  reloading = false;
  clearTimeout(rearmTimer);
  launcher.reset();
  syncControls();
  $('practice-view').setAttribute('aria-pressed', 'false');
  $('sound-toggle').textContent = '開啟音效';
  $('practice-status').textContent = '正在重置場地…';
  frame.contentWindow.location.replace('/display?practice=1');
};
$('practice-view').onclick = () => {
  const overhead = $('practice-view').getAttribute('aria-pressed') !== 'true';
  $('practice-view').setAttribute('aria-pressed', String(overhead));
  frame.contentWindow.postMessage({type: 'practice-view', view: overhead ? 'overhead' : 'broadcast'}, location.origin);
};
$('sound-toggle').onclick = async () => {
  const sound = frame.contentDocument?.getElementById('sound');
  if (sound?.onclick) {
    await sound.onclick();
    $('sound-toggle').textContent = sound.textContent;
  }
};
frame.src = '/display?practice=1';
