const section = document.querySelector('.duo-fold');
const video = section.querySelector('video');
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
let frame;
let targetTime = 0;
let ready = false;

function seek() {
  // Finish the current decode before seeking to the latest scroll position.
  if (!video.seeking && Math.abs(video.currentTime - targetTime) > 1 / 60) {
    video.currentTime = targetTime;
  }
}

function renderFold() {
  frame = null;
  section.classList.toggle('is-scroll-ready', ready && !motion.matches);
  if (!ready || motion.matches) return;
  const sticky = section.querySelector('.duo-fold-sticky');
  section.style.setProperty('--fold-content-height', `${sticky.offsetHeight}px`);
  const distance = section.offsetHeight - sticky.offsetHeight;
  const offset = parseFloat(getComputedStyle(sticky).top) || 0;
  const progress = Math.min(1, Math.max(0, (offset - section.getBoundingClientRect().top) / Math.max(1, distance)));
  const open = Math.min(1, Math.max(0, (progress - 0.08) / 0.8));
  section.style.setProperty('--fold-open', open);
  targetTime = open * Math.max(0, video.duration - 1 / 30);
  seek();
}

function requestRender() {
  if (!frame) frame = requestAnimationFrame(renderFold);
}

video.addEventListener('loadeddata', () => {
  ready = true;
  requestRender();
});
video.addEventListener('seeked', seek);
video.addEventListener('error', () => {
  ready = false;
  requestRender();
});
window.addEventListener('scroll', requestRender, { passive: true });
window.addEventListener('resize', requestRender);
motion.addEventListener('change', requestRender);
if (video.readyState >= 2) ready = true;
requestRender();

// A complete local blob supports seeking even on static servers without Range requests.
async function loadVideo() {
  try {
    const response = await fetch(video.dataset.src);
    if (!response.ok) throw new Error(`Video request failed: ${response.status}`);
    const url = URL.createObjectURL(await response.blob());
    video.src = url;
    video.load();
  } catch {
    // Keep the device poster visible if the recording cannot load.
    ready = false;
    requestRender();
  }
}
loadVideo();
