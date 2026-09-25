(() => {
  const links = [...document.querySelectorAll(".faq-toc a")];
  const sections = links
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  if (!links.length || !sections.length) return;

  const setActiveSection = () => {
    const marker = Math.min(180, window.innerHeight * 0.3);
    let activeSection = sections[0];

    for (const section of sections) {
      if (section.getBoundingClientRect().top <= marker) activeSection = section;
    }

    links.forEach((link) => {
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
