(() => {
  const hero = document.querySelector(".hero");
  const header = document.querySelector(".home-header");

  if (!hero || !header) return;

  const setHeaderVisibility = (isVisible) => {
    header.classList.toggle("is-visible", isVisible);
    header.setAttribute("aria-hidden", String(!isVisible));
    header.toggleAttribute("inert", !isVisible);
  };

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      ([entry]) => setHeaderVisibility(!entry.isIntersecting),
      { threshold: 0 }
    );

    observer.observe(hero);
    return;
  }

  let updatePending = false;

  const updateFromScroll = () => {
    setHeaderVisibility(hero.getBoundingClientRect().bottom <= 0);
    updatePending = false;
  };

  const requestUpdate = () => {
    if (updatePending) return;
    updatePending = true;
    window.requestAnimationFrame(updateFromScroll);
  };

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  updateFromScroll();
})();
