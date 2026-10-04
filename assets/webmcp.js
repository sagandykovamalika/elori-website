(() => {
  const context = document.modelContext;
  if (typeof context?.registerTool !== 'function') return;

  const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
  const canonical = () => document.querySelector('link[rel="canonical"]')?.href || location.href;
  const links = (elements, nameFor = text) => {
    const seen = new Set();
    return [...elements].flatMap((link) => {
      if (seen.has(link.href)) return [];
      seen.add(link.href);
      return [{ name: nameFor(link), url: link.href }];
    });
  };
  const register = async (name, description, read) => {
    try {
      await context.registerTool({
        name,
        description,
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: async () => JSON.stringify(read()),
      });
    } catch {
      // Experimental API failures must not affect the website.
    }
  };

  register('get_elori_page_info',
    'Read the current Elori page title, description, language, canonical URL, and existing App Store, gallery, and FAQ links.',
    () => {
      const anchors = [...document.querySelectorAll('a[href]')];
      return {
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.content || '',
        language: document.documentElement.lang,
        url: canonical(),
        links: {
          appStore: links(anchors.filter((a) => new URL(a.href).hostname === 'apps.apple.com'),
            (a) => text(a) || a.getAttribute('aria-label') || a.querySelector('img')?.alt || ''),
          gallery: links(anchors.filter((a) => a.origin === location.origin && a.pathname === '/gallery/')),
          faq: links(anchors.filter((a) => a.origin === location.origin && /\/faq\/$/.test(a.pathname))),
        },
      };
    });

  if (location.pathname.startsWith('/gallery/')) {
    register('list_gallery_items',
      'List gallery cards and category links on the current page only, including related items on detail pages. This is not a site-wide search.',
      () => ({
        items: links(document.querySelectorAll('main a.template-card, main a.collection-card, main a.collection-item-card'),
          (a) => text(a.querySelector('.template-name, .collection-item-name, .collection-copy h2'))
            || a.querySelector('.collection-title-art')?.alt || ''),
        categories: links([...document.querySelectorAll('main a[href]')].filter((a) =>
          a.origin === location.origin && /^\/gallery\/[^/]+-photo-collage-templates\/$/.test(a.pathname))),
      }));
  }

  if (/\/faq\/(?:index\.html)?$/.test(location.pathname)) {
    register('get_faq_answers',
      'Read all displayed FAQ questions and answers in the current page language, with links to their sections.',
      () => {
        let section = '';
        return [...document.querySelectorAll('main h2, main h3')].flatMap((heading) => {
          if (heading.tagName === 'H2') {
            section = heading.id;
            return [];
          }
          const paragraphs = [];
          for (let node = heading.nextElementSibling; node && !/^H[1-6]$/.test(node.tagName); node = node.nextElementSibling) {
            paragraphs.push(text(node));
          }
          const url = new URL(canonical());
          url.hash = section;
          return [{ question: text(heading), answer: paragraphs.filter(Boolean).join('\n\n'), url: url.href }];
        });
      });
  }
})();
