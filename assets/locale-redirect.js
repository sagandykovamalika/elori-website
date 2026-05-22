(() => {
  const supportedLocales = new Set(["de", "es", "fr", "ru"]);
  const redirectKey = "eloriLocaleRedirected";

  if (sessionStorage.getItem(redirectKey)) return;

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

  sessionStorage.setItem(redirectKey, "true");
  window.location.replace(`/${locale}${targetPath}`);
})();
