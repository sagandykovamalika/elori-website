#!/usr/bin/env python3
"""Check WebMCP script coverage in the static pages and gallery generator."""

import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin


ROOT = Path(__file__).resolve().parent.parent


class Page(HTMLParser):
    def __init__(self, source, url):
        super().__init__()
        self.url = url
        self.scripts = []
        self.redirect = False
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta" and attrs.get("http-equiv", "").lower() == "refresh":
            self.redirect = True
        if tag == "script" and urljoin(self.url, attrs.get("src", "")) == "https://tryelori.com/assets/webmcp.js":
            self.scripts.append(attrs)


locales = json.loads((ROOT / "i18n.json").read_text())["locale"]
pages = {}
for prefix in ["", locales["source"], *locales["targets"]]:
    for route in ["", "faq", "privacy-policy", "terms-of-use"]:
        pages[Path(prefix) / route / "index.html"] = route in ("", "faq")
pages.update({path.relative_to(ROOT): True for path in (ROOT / "gallery").rglob("*.html")})

errors = []
for path, enabled in pages.items():
    if not (ROOT / path).is_file():
        errors.append(f"{path}: missing page")
        continue
    page = Page((ROOT / path).read_text(), f"https://tryelori.com/{path.as_posix()}")
    expected = int(enabled and not page.redirect)
    if len(page.scripts) != expected:
        errors.append(f"{path}: expected {expected} WebMCP script(s), found {len(page.scripts)}")
    if any("defer" not in script for script in page.scripts):
        errors.append(f"{path}: WebMCP script must be deferred")

generator = Page((ROOT / "scripts/build-gallery.mjs").read_text(), "https://tryelori.com/gallery/")
if len(generator.scripts) != 1 or "defer" not in generator.scripts[0]:
    errors.append("Gallery generator must include exactly one deferred WebMCP script")
if not (ROOT / "assets/webmcp.js").is_file():
    errors.append("Missing assets/webmcp.js")

if errors:
    raise SystemExit("\n".join(errors))
print(f"Validated WebMCP coverage and exclusions across {len(pages)} pages and the gallery generator.")
