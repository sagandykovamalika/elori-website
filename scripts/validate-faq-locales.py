#!/usr/bin/env python3
"""Validate localized FAQ structure, schema, links, and known bad artifacts."""

from __future__ import annotations

import html
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
PAGES = {
    "en": ROOT / "faq/index.html",
    "en-copy": ROOT / "en/faq/index.html",
    **{
        locale: ROOT / locale / "faq/index.html"
        for locale in ("ar", "de", "es", "fr", "ja", "ko", "pt-BR", "ru", "zh-Hans")
    },
}
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


def text_content(fragment: str) -> str:
    without_tags = re.sub(r"<[^>]+>", " ", fragment)
    return " ".join(html.unescape(without_tags).split())


def resolve_local(page: Path, raw: str) -> Path:
    raw = raw.split("?", 1)[0]
    target = (ROOT / raw.lstrip("/")) if raw.startswith("/") else (page.parent / raw)
    target = target.resolve()
    if target.is_dir():
        target /= "index.html"
    return target


def validate(label: str, page: Path) -> None:
    source = page.read_text()
    expected_lang = "en" if label in {"en", "en-copy"} else label
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
    if label not in {"en", "en-copy"}:
        for pattern in UNTRANSLATED_PATTERNS:
            assert not re.search(pattern, source, re.I), (
                f"{label}: untranslated or corrupted text: {pattern}"
            )

    for raw in re.findall(r'(?:href|src)="([^"]+)"', source):
        if raw.startswith(("http:", "https:", "mailto:", "#")):
            continue
        target = resolve_local(page, raw)
        assert target.exists(), f"{label}: broken local link {raw}"


for locale, path in PAGES.items():
    validate(locale, path)
    print(f"{locale}: OK")

print(f"Validated {len(PAGES)} FAQ pages.")
