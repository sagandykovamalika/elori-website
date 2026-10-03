(() => {
  try {
    if (window.oaiq) return;

    const queue = function () {
      queue.q.push(arguments);
    };
    queue.q = [];
    window.oaiq = queue;

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://bzrcdn.openai.com/sdk/oaiq.min.js";
    document.head.appendChild(script);
    window.oaiq("init", { pixelId: "QYZWbquGU3Li3ztwzoSu5F" });

    const track = (event) => {
      try {
        if (event.defaultPrevented || (event.type === "auxclick" && event.button !== 1)) return;
        const link = event.target.closest("a[href]");
        if (!link) return;
        const url = new URL(link.href);
        if (url.protocol !== "https:" || url.hostname !== "apps.apple.com" ||
            !url.pathname.endsWith("/id6759309696")) return;

        window.oaiq("measure", "custom", { type: "custom" }, {
          custom_event_name: "app_store_clicked",
        });
      } catch {
        // Measurement must never interfere with opening the App Store.
      }
    };
    document.addEventListener("click", track);
    document.addEventListener("auxclick", track);
  } catch {
    // The site remains usable if the Pixel cannot initialize.
  }
})();
