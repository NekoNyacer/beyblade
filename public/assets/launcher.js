// Each kit pairs a molded housing with the matching grip and rack material.
const kits = {
  red: ['red', 'carbon'],
  blue: ['', ''],
  navy: ['', 'carbon'],
  white: ['pearl', 'amber'],
  black: ['graphite', 'smoke']
};

const playerKits = {
  '#ff486a':'red', '#37d9ff':'blue', '#ffd05b':'white', '#ac7cff':'black',
  '#50e6ac':'navy', '#ff904c':'red', '#e270ff':'black', '#62a3ff':'navy',
  '#b2e65e':'white', '#ff74a5':'red', '#48dac6':'blue', '#efb172':'white',
  '#9695ff':'black', '#f4e66b':'white', '#a0daff':'blue', '#e3b4e8':'black'
};

export function setLauncherKit(launcher, playerColor) {
  const kit = playerKits[playerColor] || 'blue';
  if (launcher.dataset.kit === kit) return;
  launcher.dataset.kit = kit;
  const [body, cord] = kits[kit];
  for (const image of launcher.querySelectorAll('img[data-part]')) {
    const part = image.dataset.part;
    const finish = part === 'body' ? body : cord;
    image.src = '/assets/launcher-' + part + '.svg' + (finish ? '#' + finish : '');
  }
}

export function sizeWinder(launcher) {
  const width = launcher.clientWidth;
  if (!width) return 0;
  const body = launcher.querySelector('.launcher-body');
  const grip = launcher.querySelector('.cord-assembly');
  const exit = body.offsetLeft + body.offsetWidth * .868;
  const margin = Math.max(8, width * .018);
  const available = width - grip.offsetLeft - grip.offsetWidth - Math.max(18, width * .045);
  const stroke = Math.max(1, Math.min(available, exit - margin));
  // As the two hands separate, keep the leader on screen and clear the housing at full travel.
  const brace = Math.max(0, Math.min(stroke * .95, body.offsetLeft + body.offsetWidth * .10 - 8, exit - stroke - margin));
  launcher.style.setProperty('--brace-ratio', String(brace / stroke));
  launcher.style.setProperty('--stroke', stroke + 'px');
  launcher.style.setProperty('--cord-length', (grip.offsetLeft + stroke - exit + brace + 1) + 'px');
  return stroke;
}
