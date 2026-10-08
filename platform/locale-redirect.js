(function redirectToBrowserLocale() {
  const path = location.pathname;
  if (path === '/en' || path.startsWith('/en/')) return;
  const params = new URLSearchParams(location.search);
  const forced = params.get('lang');
  const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
  const browserLocale = String(browserLanguages[0] || '').toLowerCase();
  const targetLanguage = forced === 'en' || (!forced && browserLocale.startsWith('en')) ? 'en' : 'zh';
  if (targetLanguage !== 'en') {
    if (forced === 'zh') {
      params.delete('lang');
      const query = params.toString();
      location.replace(`${path}${query ? `?${query}` : ''}${location.hash}`);
    }
    return;
  }
  params.delete('lang');
  const targetPath = path === '/' ? '/en/' : `/en${path}`;
  const query = params.toString();
  location.replace(`${targetPath}${query ? `?${query}` : ''}${location.hash}`);
})();
