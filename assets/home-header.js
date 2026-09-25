(() => {
  const hero = document.querySelector(".hero");
  const header = document.querySelector(".home-header");

  if (!hero || !header) return;

  const setHeaderVisibility = (isVisible) => {
    header.classList.toggle("is-visible", isVisible);
    header.setAttribute("aria-hidden", String(!isVisible));
  };

  const observer = new IntersectionObserver(
    ([entry]) => setHeaderVisibility(!entry.isIntersecting),
    { threshold: 0 }
  );

  observer.observe(hero);
})();
