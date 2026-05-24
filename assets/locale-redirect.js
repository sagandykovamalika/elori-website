(() => {
  const supportedLocales = new Set(["de", "es", "fr", "ru"]);

  const browserLocales = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  const locale = browserLocales
    .map((language) =>
      typeof language === "string" ? language.toLowerCase().split("-")[0] : null
    )
    .find((language) => language === "en" || supportedLocales.has(language));

  if (!locale || locale === "en") return;

  const pagePath = document.currentScript?.dataset.localePath || "/";
  const targetPath = pagePath.startsWith("/") ? pagePath : `/${pagePath}`;
  const redirectKey = `eloriLocaleRedirected:${targetPath}`;

  if (sessionStorage.getItem(redirectKey)) return;

  sessionStorage.setItem(redirectKey, "true");

  if (
    window.location.pathname === `/${locale}` ||
    window.location.pathname.startsWith(`/${locale}/`)
  ) {
    return;
  }

  window.location.replace(`/${locale}${targetPath}`);
})();
