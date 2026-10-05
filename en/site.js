const links = [
  ['/', 'Home'], ['/projects/?lang=en', 'Projects'], ['/en/learn/', 'Build guide'],
  ['/en/kits/', 'Kits'], ['/en/updates/', 'News'], ['/en/hackathon/', 'Hackathon'],
  ['/en/community/', 'Community'], ['/en/about/', 'About']
];

const header = document.querySelector('header');
if (header) {
  const logo = document.createElement('a');
  logo.className = 'logo';
  logo.href = '/en/';
  logo.setAttribute('aria-label', 'embuddies home');
  const image = document.createElement('img');
  image.src = '/assets/embuddies-logo.jpg';
  image.alt = 'embuddies';
  image.width = 186;
  image.height = 57;
  logo.append(image);
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Main navigation');
  for (const [href, label] of links) {
    const link = document.createElement('a');
    link.href = href === '/' ? '/en/' : href;
    link.textContent = label;
    if (location.pathname === link.pathname) link.setAttribute('aria-current', 'page');
    nav.append(link);
  }
  header.append(logo, nav);
}

const footer = document.querySelector('footer');
if (footer) {
  const home = document.createElement('a');
  home.className = 'logo';
  home.href = '/en/';
  const image = document.createElement('img');
  image.src = '/assets/embuddies-logo.jpg';
  image.alt = 'embuddies';
  image.width = 186;
  image.height = 57;
  home.append(image);
  const copyright = document.createElement('p');
  copyright.textContent = 'embodied + buddies · © 2026 embuddies';
  const top = document.createElement('a');
  top.href = '#top';
  top.textContent = 'Back to top ↑';
  footer.append(home, copyright, top);
}
