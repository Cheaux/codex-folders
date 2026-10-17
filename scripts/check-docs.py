"""Check rendered Pages output, including links and search metadata."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import sys
import xml.etree.ElementTree as ET

root = Path(sys.argv[1])
origin = "https://cheaux.github.io"
base = "/codex-folders"
pages = ["", "install/", "context/", "commands/", "troubleshooting/", "faq/"]


class Page(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.links, self.canonical, self.description, self.image = [], [], [], []
        self.ids = set()
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if "id" in values:
            self.ids.add(values["id"])
        if tag == "a" and values.get("href"):
            self.links.append(values["href"])
        if tag in ("img", "script") and values.get("src"):
            self.links.append(values["src"])
        if tag == "link" and values.get("rel") == "canonical":
            self.canonical.append(values.get("href"))
        if tag == "link" and values.get("rel") in ("stylesheet", "icon"):
            self.links.append(values.get("href"))
        if tag == "meta" and values.get("name") == "description":
            self.description.append(values.get("content"))
        if tag == "meta" and values.get("property") == "og:image":
            self.image.append(values.get("content"))


parsed = {}
for page in pages:
    path = root / page / "index.html"
    source = path.read_text()
    assert "{%" not in source and "{{" not in source, f"Unrendered Liquid: {path}"
    doc = Page(source)
    assert doc.canonical == [f"{origin}{base}/{page}"], (page, doc.canonical)
    assert len(doc.description) == 1 and doc.description[0], f"Missing description: {page}"
    assert doc.image == [f"{origin}{base}/assets/social-card.png"], (page, doc.image)
    parsed[page] = doc

for page, doc in parsed.items():
    for link in doc.links:
        target = urlsplit(link)
        if target.scheme in ("mailto", "data") or (target.netloc and f"{target.scheme}://{target.netloc}" != origin):
            continue
        path = unquote(target.path)
        if not path:
            dest = root / page / "index.html"
        elif path.startswith(base + "/"):
            dest = root / path[len(base) + 1:]
        else:
            raise AssertionError(f"Unexpected project link on {page}: {link}")
        if dest.is_dir():
            dest /= "index.html"
        assert dest.is_file(), f"Missing local target on {page}: {link}"
        if target.fragment and dest.suffix == ".html":
            assert unquote(target.fragment) in Page(dest.read_text()).ids, f"Missing anchor: {link}"

sitemap = ET.parse(root / "sitemap.xml")
locations = {node.text for node in sitemap.findall(".//{*}loc")}
for page in pages:
    assert f"{origin}{base}/{page}" in locations, f"Missing sitemap URL: {page}"
print(f"Documentation checks passed: {len(pages)} pages, canonical URLs, descriptions, social images, local links, anchors, sitemap.")
