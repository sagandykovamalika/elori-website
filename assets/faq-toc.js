(() => {
  const items = [...document.querySelectorAll(".faq-toc a")]
    .map((link) => ({ link, section: document.getElementById(link.hash.slice(1)) }))
    .filter(({ section }) => section);

  if (!items.length) return;

  const setActiveSection = () => {
    const marker = Math.min(180, window.innerHeight * 0.3);
    let activeSection = items[0].section;

    for (const { section } of items) {
      if (section.getBoundingClientRect().top <= marker) activeSection = section;
    }

    items.forEach(({ link }) => {
      const isActive = link.hash === `#${activeSection.id}`;
      link.classList.toggle("is-active", isActive);
      if (isActive) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  };

  let frame;
  const requestUpdate = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      setActiveSection();
    });
  };

  setActiveSection();
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
})();
