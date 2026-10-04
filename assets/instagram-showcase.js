(() => {
  const grid = document.querySelector('.instagram-grid');
  if (!grid) return;

  const posts = [...grid.querySelectorAll('.instagram-post')].map((element) => ({
    element,
    title: element.querySelector('a').textContent.trim(),
  }));

  const load = () => {
    // Instagram replaces the fallback links with iframes asynchronously.
    const titles = new MutationObserver(() => {
      let ready = 0;
      for (const post of posts) {
        const frame = post.element.querySelector('iframe');
        if (!frame) continue;
        frame.title = post.title;
        ready += 1;
      }
      if (ready === posts.length) titles.disconnect();
    });
    titles.observe(grid, { childList: true, subtree: true });

    const script = document.createElement('script');
    script.src = 'https://www.instagram.com/embed.js';
    script.async = true;
    script.onerror = () => titles.disconnect();
    document.body.append(script);
  };

  // Older browsers retain working links without downloading the embeds.
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    load();
  }, { rootMargin: '300px 0px' });
  observer.observe(grid);
})();
