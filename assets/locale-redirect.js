(() => {
  const supportedLocales = new Set(["de", "es", "fr", "ru"]);
  const redirectKey = "eloriLocaleRedirected";

  if (sessionStorage.getItem(redirectKey)) return;

  const browserLocales = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  const locale = browserLocales
    .map((language) => language.toLowerCase().split("-")[0])
    .find((language) => language === "en" || supportedLocales.has(language));

  if (!locale || locale === "en") return;

  const pagePath = document.currentScript?.dataset.localePath || "/";
  const normalizedPath = pagePath.startsWith("/") ? pagePath : `/${pagePath}`;
  const targetPath = normalizedPath === "/" ? "/" : normalizedPath;

  sessionStorage.setItem(redirectKey, "true");
  window.location.replace(`/${locale}${targetPath}`);
})();
