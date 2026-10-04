(() => {
  const grid = document.querySelector('.instagram-grid');
  if (!grid) return;

  const posts = [...grid.querySelectorAll('.instagram-post')].map((element) => {
    const link = element.querySelector('a');
    return {
      element,
      title: link?.textContent.trim() || 'Instagram post',
      link: link?.cloneNode(true),
    };
  });
  if (!posts.length) return;

  const load = () => {
    const script = document.createElement('script');
    const finish = (failed = false) => {
      clearTimeout(timeout);
      titles.disconnect();
      script.onerror = null;
      if (!failed) return;

      script.remove();
      for (const post of posts) {
        if (post.element.querySelector('iframe')) continue;
        // Remove embed markup so a late script cannot replace the fallback.
        const fallback = document.createElement('blockquote');
        fallback.append(post.link || post.title);
        post.element.replaceChildren(fallback);
      }
    };

    // Instagram replaces the fallback links with iframes asynchronously.
    const titles = new MutationObserver(() => {
      let ready = 0;
      for (const post of posts) {
        const frame = post.element.querySelector('iframe');
        if (!frame) continue;
        frame.title = post.title;
        ready += 1;
      }
      if (ready === posts.length) finish();
    });
    titles.observe(grid, { childList: true, subtree: true });

    const timeout = setTimeout(() => finish(true), 15000);
    script.src = 'https://www.instagram.com/embed.js';
    script.async = true;
    script.onerror = () => finish(true);
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
