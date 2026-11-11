const tabs = [...document.querySelectorAll('.desk-nav [role="tab"]')];
function selectTab(tab, focus = false) {
  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
  }
  if (focus) tab.focus();
}
function requestedTab() {
  return tabs.find(tab => '#' + tab.id.slice(4) === location.hash) || tabs[0];
}
function navigate(tab, focus = false) {
  history.replaceState(null, '', location.pathname + location.search + '#' + tab.id.slice(4));
  selectTab(tab, focus);
}
for (const tab of tabs) {
  tab.addEventListener('click', () => navigate(tab));
  tab.addEventListener('keydown', event => {
    const index = tabs.indexOf(tab);
    const next = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    navigate(tabs[next], true);
  });
}
document.getElementById('view-roster').addEventListener('click', () => navigate(document.getElementById('tab-players'), true));
window.addEventListener('hashchange', () => selectTab(requestedTab()));
selectTab(requestedTab());
