(() => {
  const header = document.querySelector(".home-header");
  const hero = document.querySelector(".hero");
  if (!header || !hero) return;

  const update = () => {
    const visible = hero.getBoundingClientRect().bottom <= 0;
    header.classList.toggle("is-visible", visible);
    header.setAttribute("aria-hidden", String(!visible));
    header.toggleAttribute("inert", !visible);
  };

  new IntersectionObserver(update).observe(hero);
  window.addEventListener("pageshow", update);
  update();
})();
