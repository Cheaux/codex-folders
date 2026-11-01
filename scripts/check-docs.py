"""Check rendered Pages output, including links and search metadata."""
from html.parser import HTMLParser
import json
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
        self.h1_count = 0
        self.main_count = 0
        self.schemas = []
        self.in_schema = False
        self.schema_text = ""
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "h1": self.h1_count += 1
        if tag == "main": self.main_count += 1
        if tag == "script" and values.get("type") == "application/ld+json":
            self.in_schema = True
            self.schema_text = ""
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

    def handle_data(self, data):
        if self.in_schema:
            self.schema_text += data

    def handle_endtag(self, tag):
        if tag == "script" and self.in_schema:
            self.schemas.append(json.loads(self.schema_text))
            self.in_schema = False


parsed = {}
for page in pages:
    path = root / page / "index.html"
    source = path.read_text()
    assert "{%" not in source and "{{" not in source, f"Unrendered Liquid: {path}"
    doc = Page(source)
    assert doc.canonical == [f"{origin}{base}/{page}"], (page, doc.canonical)
    assert len(doc.description) == 1 and doc.description[0], f"Missing description: {page}"
    assert doc.image == [f"{origin}{base}/assets/social-card.png"], (page, doc.image)
    assert doc.h1_count == 1, (page, "H1 count", doc.h1_count)
    assert doc.main_count == 1, (page, "main count", doc.main_count)
    assert "main-content" in doc.ids
    assert "#main-content" in doc.links
    parsed[page] = doc

home_schemas = [s for s in parsed[""].schemas if s.get("@type") == "SoftwareSourceCode"]
assert len(home_schemas) == 1, "Missing or duplicate project schema"
project = home_schemas[0]
assert project["codeRepository"] == "https://github.com/Cheaux" + base
assert project["version"] == json.loads(Path("package.json").read_text())["version"]
index = (root / "llms.txt").read_text()
assert not index.startswith("---") and "{%" not in index and "{{" not in index
assert project["codeRepository"] in index

for page, doc in parsed.items():
    for link in doc.links:
        target = urlsplit(link)
        if target.scheme in ("mailto", "data") or (target.netloc and f"{target.scheme}://{target.netloc}" != origin):
            continue
        if target.netloc and not target.path.startswith(base + "/"):
            continue  # Other projects on the same GitHub Pages host.
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
