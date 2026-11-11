const $ = (selector) => document.querySelector(selector);
const PACK_IDS = ['arena', 'metal', 'neon'];
const LETTERS = ['A', 'B', 'C'];
const STORAGE_KEY = 'beyblade-sound-lab-v1';
const SPIN_THRESHOLD = 55;
const GROUPS = [
  ['介面操作', ['ui_hover', 'ui_confirm', 'ui_back', 'ui_ready']],
  ['倒數與主持人', ['countdown_3', 'countdown_2', 'countdown_1', 'announcer_go', 'announcer_shoot']],
  ['發射與旋轉', ['launch', 'spin_loop']],
  ['戰鬥接觸', ['impact_light', 'impact_heavy', 'rail_dash', 'shield_hit', 'pocket_drop', 'ring_out']],
  ['勝負結果', ['victory', 'defeat']],
];
const CUE_IDS = GROUPS.flatMap(([, ids]) => ids);
const NOTES = { announcer_go: 'GOOOOO…', announcer_shoot: 'SHOOT!', spin_loop: '持續循環 · 高於 55% 才發聲' };
let manifest, choices = {}, context, master, spin, generation = 0, demoRunning = false;
let loadingManifest = false;
const buffers = new Map();
const activeSources = new Set();
const timers = new Set();

function status(message) { $('#play-status').textContent = message; }
function cueLabel(id) { return manifest.cues.find(cue => cue.id === id).label; }
function packLabel(id) { return manifest.packs.find(pack => pack.id === id).label; }
function later(callback, milliseconds) {
  const timer = setTimeout(() => { timers.delete(timer); callback(); }, milliseconds);
  timers.add(timer);
}
function showStage(word, caption) {
  $('#stage-word').textContent = word;
  $('#stage-caption').textContent = caption;
}
function updateSelection() {
  const uniform = PACK_IDS.find(id => CUE_IDS.every(cue => choices[cue] === id));
  $('#selection-label').textContent = uniform ? `整組 ${LETTERS[PACK_IDS.indexOf(uniform)]}` : '自選混搭';
  document.querySelectorAll('.pack').forEach(button => {
    const selected = uniform === button.dataset.pack;
    button.setAttribute('aria-pressed', String(selected));
    button.querySelector('.pack-action').textContent = selected ? '已整組選用' : '整組選用';
  });
  document.querySelectorAll('.cue-button').forEach(button => {
    button.setAttribute('aria-pressed', String(choices[button.dataset.cue] === button.dataset.pack));
  });
}
function saveChoices() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, choices }));
    $('#save-status').textContent = '已儲存在這個瀏覽器，不影響正式遊戲。';
  } catch {
    $('#save-status').textContent = '瀏覽器未允許儲存。可匯出 JSON 保留選擇。';
  }
  updateSelection();
}
function render() {
  $('#packs').replaceChildren();
  for (const [index, pack] of manifest.packs.entries()) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'pack'; button.dataset.pack = pack.id;
    button.innerHTML = '<span class="pack-letter"></span><span class="pack-name"></span><span class="pack-description"></span><span class="pack-action">整組選用</span>';
    button.querySelector('.pack-letter').textContent = LETTERS[index];
    button.querySelector('.pack-name').textContent = pack.label.replace(/^[ABC]\s*/, '');
    button.querySelector('.pack-description').textContent = pack.description;
    button.setAttribute('aria-label', `${LETTERS[index]} ${pack.label}，整組選用`);
    button.addEventListener('click', () => {
      stopAll();
      CUE_IDS.forEach(id => { choices[id] = pack.id; });
      saveChoices(); status(`已選用${pack.label}。按播放或單項按鈕試聽。`);
    });
    $('#packs').append(button);
  }
  $('#cues').replaceChildren();
  for (const [label, ids] of GROUPS) {
    const group = document.createElement('section'); group.className = 'cue-group';
    const heading = document.createElement('h3'); heading.textContent = label; group.append(heading);
    for (const id of ids) {
      const row = document.createElement('div'); row.className = 'cue-row'; row.dataset.cue = id;
      const name = document.createElement('span'); name.className = 'cue-name'; name.textContent = cueLabel(id);
      if (NOTES[id]) { const note = document.createElement('span'); note.className = 'cue-note'; note.textContent = NOTES[id]; name.append(note); }
      row.append(name);
      for (const [index, pack] of manifest.packs.entries()) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'cue-button';
        button.dataset.cue = id; button.dataset.pack = pack.id;
        button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 4 13 8-13 8Z"/></svg><span></span>';
        button.querySelector('span').textContent = LETTERS[index];
        button.setAttribute('aria-label', `${cueLabel(id)}：試聽並選用 ${LETTERS[index]} ${pack.label}`);
        button.addEventListener('click', () => {
          choices[id] = pack.id; saveChoices();
          if (id === 'spin_loop') startSpin(); else audition(id, pack.id);
        });
        row.append(button);
      }
      group.append(row);
    }
    $('#cues').append(group);
  }
  $('#voice-quality').textContent = `${manifest.voice.quality}。聲音來源：${manifest.voice.source}。`;
  $('#packs').setAttribute('aria-busy', 'false'); $('#cues').setAttribute('aria-busy', 'false');
  for (const id of ['play-demo', 'toggle-spin', 'export']) $(`#${id}`).disabled = false;
  updateSelection();
}
async function loadManifest() {
  if (loadingManifest) return;
  loadingManifest = true; $('#retry').disabled = true; $('#load-error').hidden = true;
  try {
    const response = await fetch('/assets/sound-packs/manifest.json');
    if (!response.ok) throw new Error('音效清單無法載入');
    const data = await response.json();
    if (!Array.isArray(data.packs) || !Array.isArray(data.cues) || !data.voice ||
      !PACK_IDS.every(id => data.packs.some(pack => pack.id === id && typeof pack.label === 'string' && typeof pack.description === 'string')) ||
      !CUE_IDS.every(id => data.cues.some(cue => cue.id === id && typeof cue.label === 'string')) ||
      typeof data.voice.quality !== 'string' || typeof data.voice.source !== 'string') throw new Error('音效清單格式不完整');
    manifest = { ...data, packs: PACK_IDS.map(id => data.packs.find(pack => pack.id === id)) };
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY))?.choices; } catch { /* Corrupt or unavailable storage uses defaults. */ }
    choices = Object.fromEntries(CUE_IDS.map(id => [id, PACK_IDS.includes(saved?.[id]) ? saved[id] : 'arena']));
    render();
  } catch (error) {
    $('#load-error span').textContent = `${error.message}，請確認本機服務已啟動後重試。`;
    $('#load-error').hidden = false;
    $('#packs').setAttribute('aria-busy', 'false'); $('#packs').textContent = '音效清單尚未就緒。';
    status('尚未載入音效。');
  } finally { loadingManifest = false; $('#retry').disabled = false; }
}
async function audioReady() {
  if (!context) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('這個瀏覽器不支援 Web Audio，請改用新版 Chrome、Edge 或 Safari');
    context = new AudioContext(); master = context.createGain();
    master.gain.value = Number($('#volume').value) / 100; const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -10; compressor.knee.value = 8; compressor.ratio.value = 20;
    compressor.attack.value = .003; compressor.release.value = .12;
    master.connect(compressor); compressor.connect(context.destination);
  }
  await context.resume();
  if (context.state !== 'running') throw new Error('音訊尚未啟動，請再次點擊播放');
}
function loadBuffer(pack, cue) {
  const key = `${pack}/${cue}`;
  if (!buffers.has(key)) {
    const pending = fetch(`/assets/sound-packs/${key}.wav`).then(async response => {
      if (!response.ok) throw new Error(`${packLabel(pack)}的「${cueLabel(cue)}」載入失敗`);
      return context.decodeAudioData(await response.arrayBuffer());
    }).catch(error => { buffers.delete(key); throw error; });
    buffers.set(key, pending);
  }
  return buffers.get(key);
}
function makeSource(buffer, cue, when = context.currentTime, loop = false) {
  const source = context.createBufferSource(); const gain = context.createGain();
  source.buffer = buffer; source.loop = loop; source.connect(gain); gain.connect(master);
  const item = { source, gain, cue }; activeSources.add(item);
  source.onended = () => {
    activeSources.delete(item); source.disconnect(); gain.disconnect();
    if (!activeSources.size && !demoRunning && !spin) {
      document.querySelectorAll('.is-playing').forEach(row => row.classList.remove('is-playing'));
      status('播放完畢，可繼續比較。');
    }
  };
  if (loop) gain.gain.value = 0;
  source.start(when);
  return item;
}
function markCue(cue) {
  document.querySelectorAll('.is-playing').forEach(row => row.classList.remove('is-playing'));
  document.querySelector(`.cue-row[data-cue="${cue}"]`)?.classList.add('is-playing');
}
function stopAll(message = '已停止全部聲音。') {
  generation++;
  timers.forEach(clearTimeout); timers.clear();
  for (const item of activeSources) {
    item.source.onended = null;
    try { item.source.stop(); } catch { /* A completed source is already silent. */ }
    item.source.disconnect(); item.gain.disconnect();
  }
  activeSources.clear(); spin = null; demoRunning = false;
  document.querySelectorAll('.is-playing').forEach(row => row.classList.remove('is-playing'));
  $('#toggle-spin').setAttribute('aria-pressed', 'false'); $('#toggle-spin').textContent = '開始持續旋轉';
  $('#spin-status').textContent = '尚未啟動'; $('#play-demo span').textContent = '播放完整試演';
  $('#demo-progress').style.width = '0%'; showStage('READY', '依照下方選擇播放'); status(message);
}
function failed(error, token) {
  if (token !== generation) return;
  stopAll(); status(`無法播放：${error.message}。請重試。`);
}
async function audition(cue, pack) {
  stopAll(); const token = generation; status(`正在載入「${cueLabel(cue)}」…`);
  try {
    await audioReady(); const buffer = await loadBuffer(pack, cue);
    if (token !== generation || document.hidden) return;
    makeSource(buffer, cue); markCue(cue);
    showStage(LETTERS[PACK_IDS.indexOf(pack)], cueLabel(cue));
    status(`試聽：${packLabel(pack)} · ${cueLabel(cue)}`);
  } catch (error) { failed(error, token); }
}
function updateSpin(when = context?.currentTime) {
  const rpm = Number($('#rpm').value); $('#rpm-value').textContent = `${rpm}%`;
  if (!spin) return;
  const audible = rpm > SPIN_THRESHOLD;
  const ratio = Math.max(0, (rpm - SPIN_THRESHOLD) / (100 - SPIN_THRESHOLD));
  spin.gain.gain.cancelScheduledValues(when);
  if (audible) spin.gain.gain.setTargetAtTime(ratio * .65, when, .035);
  else spin.gain.gain.setValueAtTime(0, when);
  spin.source.playbackRate.cancelScheduledValues(when);
  spin.source.playbackRate.setTargetAtTime(.75 + rpm / 100 * .75, when, .05);
  $('#spin-status').textContent = audible ? `旋轉中 · ${rpm}% · ${packLabel(choices.spin_loop)}` : `旋轉中 · ${rpm}% · 低速靜音`;
}
async function startSpin() {
  stopAll(); const token = generation; status('正在載入旋轉聲…');
  try {
    await audioReady(); const buffer = await loadBuffer(choices.spin_loop, 'spin_loop');
    if (token !== generation || document.hidden) return;
    spin = makeSource(buffer, 'spin_loop', context.currentTime, true); updateSpin(); markCue('spin_loop');
    $('#toggle-spin').setAttribute('aria-pressed', 'true'); $('#toggle-spin').textContent = '停止持續旋轉';
    showStage('SPIN', '拖動轉速，聽見高速與靜音的交界'); status('持續旋轉中。可拖動轉速或按全部停止。');
  } catch (error) { failed(error, token); }
}
const SEQUENCE = [
  [0, 'countdown_3', '3'], [1, 'countdown_2', '2'], [2, 'countdown_1', '1'],
  [3, 'announcer_go', 'GOOOOO'], [5, 'announcer_shoot', 'SHOOT!'], [5.2, 'launch', 'LAUNCH'],
  [5.8, 'impact_light', 'CLASH'], [6.3, 'rail_dash', 'DASH'], [6.8, 'impact_heavy', 'CLASH!'],
  [7.3, 'shield_hit', 'HIT'], [7.8, 'ring_out', 'RING OUT'], [8.2, 'victory', 'VICTORY'],
];
async function playDemo() {
  stopAll(); const token = generation; const selected = { ...choices };
  status('正在準備完整試演…'); $('#play-demo span').textContent = '重新開始試演';
  try {
    await audioReady();
    const ids = [...new Set([...SEQUENCE.map(([, cue]) => cue), 'spin_loop'])];
    const decoded = new Map(await Promise.all(ids.map(async cue => [cue, await loadBuffer(selected[cue], cue)])));
    if (token !== generation || document.hidden) return;
    demoRunning = true; const start = context.currentTime + .08;
    status('試演播放中 · 倒數 → 發射 → 碰撞 → 勝利');
    for (const [seconds, cue, word] of SEQUENCE) {
      makeSource(decoded.get(cue), cue, start + seconds);
      later(() => { showStage(word, cueLabel(cue)); markCue(cue); }, (seconds + .08) * 1000);
    }
    spin = makeSource(decoded.get('spin_loop'), 'spin_loop', start + 5.2, true);
    updateSpin(start + 5.2);
    $('#spin-status').textContent = '試演發射後開始，使用目前設定的轉速';
    for (let step = 1; step <= 100; step++) later(() => { $('#demo-progress').style.width = `${step}%`; }, step * 100 + 80);
    later(() => { stopAll('10 秒試演結束。可以換組再比較。'); showStage('FINISH', '換一組，或逐項混搭'); $('#demo-progress').style.width = '100%'; }, 10080);
  } catch (error) { failed(error, token); }
}
$('#play-demo').addEventListener('click', playDemo);
$('#stop-all').addEventListener('click', () => stopAll());
$('#toggle-spin').addEventListener('click', () => { if (spin && !demoRunning) stopAll(); else startSpin(); });
$('#rpm').addEventListener('input', () => updateSpin());
$('#volume').addEventListener('input', () => {
  const value = Number($('#volume').value) / 100; $('#volume-value').textContent = `${Math.round(value * 100)}%`;
  if (master) {
    master.gain.cancelScheduledValues(context.currentTime);
    if (value === 0) master.gain.setValueAtTime(0, context.currentTime);
    else master.gain.setTargetAtTime(value, context.currentTime, .02);
  }
});
$('#export').addEventListener('click', () => {
  const selection = { version: 1, previewOnly: true, highRpmThresholdPercent: SPIN_THRESHOLD, choices: { ...choices } };
  const url = URL.createObjectURL(new Blob([JSON.stringify(selection, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'beyblade-sound-selection.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('#retry').addEventListener('click', loadManifest);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopAll('離開頁面，已停止播放。'); });
window.addEventListener('pagehide', () => stopAll());
loadManifest();
