const contents = document.querySelector('.collection-contents');
const sections = [...contents.querySelectorAll('.collection-content-section')];
const tabs = document.createElement('div');
tabs.className = 'collection-tabs';
tabs.setAttribute('role', 'tablist');
tabs.setAttribute('aria-label', 'Collection content type');

const panel = document.createElement('div');
panel.id = 'collection-panel';
panel.setAttribute('role', 'tabpanel');
panel.tabIndex = 0;
panel.append(...sections);

const filters = [
  { title: 'All' },
  ...sections.map((section) => ({ title: section.querySelector('h2').textContent, section })),
];

function selectTab(index) {
  [...tabs.children].forEach((tab, tabIndex) => {
    tab.setAttribute('aria-selected', tabIndex === index);
    tab.tabIndex = tabIndex === index ? 0 : -1;
  });
  sections.forEach((section) => {
    section.hidden = index !== 0 && section !== filters[index].section;
    section.querySelector('.template-section-heading').hidden = index !== 0;
  });
  panel.setAttribute('aria-labelledby', `collection-tab-${index}`);
  panel.classList.toggle('is-filtered', index !== 0);
}

filters.forEach((filter, index) => {
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.id = `collection-tab-${index}`;
  tab.textContent = filter.title;
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-controls', panel.id);
  tab.addEventListener('click', () => selectTab(index));
  tab.addEventListener('keydown', (event) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % filters.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + filters.length) % filters.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = filters.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    selectTab(next);
    tabs.children[next].focus({ preventScroll: true });
    tabs.children[next].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  tabs.append(tab);
});

contents.append(tabs, panel);
selectTab(0);
