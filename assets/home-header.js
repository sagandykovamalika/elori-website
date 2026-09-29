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

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(update).observe(hero);
  } else {
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
  }
  window.addEventListener("pageshow", update);
  update();
})();

(() => {
  const track = document.querySelector(".screenshots-track");
  if (!track || !track.children.length) return;

  const update = () => {
    const max = track.scrollWidth - track.clientWidth;
    const left = getComputedStyle(track).direction === "rtl" ? max + track.scrollLeft : track.scrollLeft;
    track.style.setProperty("--fade-left", left > 1 ? "96px" : "0px");
    track.style.setProperty("--fade-right", left < max - 1 ? "96px" : "0px");
  };

  track.addEventListener("scroll", update, { passive: true });
  new ResizeObserver(update).observe(track);
  window.addEventListener("pageshow", update);
  update();
})();
