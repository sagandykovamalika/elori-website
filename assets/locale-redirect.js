(() => {
  const supportedLocales = new Map(
    ["ar", "de", "es", "fr", "ja", "ko", "pt-BR", "ru", "zh-Hans"].map((locale) => [
      locale.toLowerCase(),
      locale,
    ])
  );
  const defaultLocales = new Map([
    ["pt", "pt-BR"],
    ["zh", "zh-Hans"],
  ]);

  const browserLocales = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  const locale = browserLocales
    .map((language) => {
      if (typeof language !== "string") return null;

      const normalized = language.toLowerCase();
      const base = normalized.split("-")[0];

      if (
        base === "zh" &&
        (normalized.includes("hant") ||
          normalized.includes("tw") ||
          normalized.includes("hk") ||
          normalized.includes("mo"))
      ) {
        return null;
      }

      return supportedLocales.get(normalized) || defaultLocales.get(base) || supportedLocales.get(base) || base;
    })
    .filter(Boolean)
    .find((language) => language === "en" || supportedLocales.has(language.toLowerCase()));

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
