#!/usr/bin/env python3
"""Validate localized FAQ source files and known translation artifacts.

This is a source-level check for the repository's checked-in static deployment
files. Local links are verified against files in the checkout; external URLs,
hosting redirects, and the live production deployment are outside its scope.
"""

from __future__ import annotations

import html
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
PAGES = {
    "en": ROOT / "faq/index.html",
    **{
        locale: ROOT / locale / "faq/index.html"
        for locale in ("ar", "de", "es", "fr", "ja", "ko", "pt-BR", "ru", "zh-Hans")
    },
}
ENGLISH_REDIRECT = ROOT / "en/faq/index.html"
LOCALE_REDIRECT = ROOT / "assets/locale-redirect.js"
BAD_PATTERNS = (
    r"\{\\fn",
    r"\{\\fs",
    r"&amp;quot;",
    r"⟦ZZZ",
)
UNTRANSLATED_PATTERNS = (
    r"supports photo grid and collage layouts including spiritual",
    r"graphics, landscape collages",
    r"The free version supports",
    r"A project can contain still photos",
)
TRANSLATED_BRAND_PATTERNS = (
    r"إلوري",
    r"إيلوري",
    r"الوري",
    r"Элор",
    r"伊洛里",
    r"埃洛里",
    r"艾洛里",
    r"エルオリ",
    r"エロリ",
    r"イロリ",
    r"엘로리",
    r"앨로리",
)


def text_content(fragment: str) -> str:
    without_tags = re.sub(r"<[^>]+>", " ", fragment)
    return " ".join(html.unescape(without_tags).split())


def resolve_repository_target(page: Path, raw: str) -> Path:
    raw = raw.split("?", 1)[0]
    target = (ROOT / raw.lstrip("/")) if raw.startswith("/") else (page.parent / raw)
    target = target.resolve()
    assert target.is_relative_to(ROOT), f"link escapes repository root: {raw}"
    if target.is_dir():
        target /= "index.html"
    return target


def validate(label: str, page: Path) -> None:
    source = page.read_text()
    expected_lang = label
    html_tag = re.search(r"<html\s+([^>]+)>", source).group(1)
    assert f'lang="{expected_lang}"' in html_tag, f"{label}: incorrect lang attribute"
    if label == "ar":
        assert 'dir="rtl"' in html_tag, "ar: missing RTL direction"

    section_ids = re.findall(r'<h2 id="([^"]+)">', source)
    toc_match = re.search(r'<nav class="faq-toc".*?</nav>', source, re.S)
    toc_ids = re.findall(r'<a href="#([^"]+)">', toc_match.group(0))
    pairs = re.findall(r"<h3>(.*?)</h3>\s*<p>(.*?)</p>", source, re.S)
    questions = [text_content(question) for question, _ in pairs]
    answers = [text_content(answer) for _, answer in pairs]

    if label != "en":
        english_pairs = re.findall(
            r"<h3>(.*?)</h3>\s*<p>(.*?)</p>", PAGES["en"].read_text(), re.S
        )
        english_questions = [text_content(question) for question, _ in english_pairs]
        english_answers = [text_content(answer) for _, answer in english_pairs]
        for index, (question, answer) in enumerate(zip(questions, answers), start=1):
            assert question != english_questions[index - 1], (
                f"{label}: question {index} is identical to English"
            )
            assert answer != english_answers[index - 1], (
                f"{label}: answer {index} is identical to English"
            )

    schema_match = re.search(
        r'<script type="application/ld\+json">\s*(.*?)\s*</script>', source, re.S
    )
    schema = json.loads(schema_match.group(1))
    entities = schema["mainEntity"]

    assert len(section_ids) == 11, f"{label}: expected 11 sections"
    assert len(set(section_ids)) == 11, f"{label}: duplicate section IDs"
    assert toc_ids == section_ids, f"{label}: TOC and section IDs differ"
    assert len(pairs) == 42, f"{label}: expected 42 visible questions"
    assert len(entities) == 42, f"{label}: expected 42 schema questions"
    schema_questions = [" ".join(entry["name"].split()) for entry in entities]
    schema_answers = [
        " ".join(html.unescape(entry["acceptedAnswer"]["text"]).split()) for entry in entities
    ]
    assert schema_questions == questions, f"{label}: schema questions differ"
    assert schema_answers == answers, (
        f"{label}: schema answers differ"
    )
    assert source.count('hreflang=') == 11, f"{label}: incomplete hreflang set"
    for pattern in BAD_PATTERNS:
        assert not re.search(pattern, source, re.I), f"{label}: bad translation artifact: {pattern}"
    for pattern in TRANSLATED_BRAND_PATTERNS:
        assert not re.search(pattern, source, re.I), (
            f"{label}: translated brand name: {pattern}"
        )
    if label != "en":
        for pattern in UNTRANSLATED_PATTERNS:
            assert not re.search(pattern, source, re.I), (
                f"{label}: untranslated or corrupted text: {pattern}"
            )

    for raw in re.findall(r'(?:href|src)="([^"]+)"', source):
        if raw.startswith(("http:", "https:", "mailto:", "#")):
            continue
        target = resolve_repository_target(page, raw)
        assert target.is_file(), f"{label}: missing repository link target {raw}"


def validate_english_redirect() -> None:
    source = ENGLISH_REDIRECT.read_text()
    assert '<meta http-equiv="refresh" content="0; url=/faq/" />' in source, (
        "en redirect: missing no-JavaScript redirect to /faq/"
    )
    assert (
        'window.location.replace(`/faq/${window.location.search}${window.location.hash}`)'
        in source
    ), (
        "en redirect: missing JavaScript redirect to /faq/"
    )
    assert '<link rel="canonical" href="https://tryelori.com/faq/" />' in source, (
        "en redirect: canonical URL must be /faq/"
    )
    assert 'type="application/ld+json"' not in source, (
        "en redirect: must not duplicate FAQ structured data"
    )
    assert '<main' not in source, "en redirect: must not duplicate the FAQ document"


def validate_locale_redirect() -> None:
    source = LOCALE_REDIRECT.read_text()
    assert "${window.location.search}${window.location.hash}" in source, (
        "locale redirect: query string and fragment must be preserved"
    )


for locale, path in PAGES.items():
    validate(locale, path)
    print(f"{locale}: OK")

validate_english_redirect()
print("en redirect: OK")
validate_locale_redirect()
print("locale redirect: OK")
print(f"Validated {len(PAGES)} FAQ pages and both redirect behaviors.")
