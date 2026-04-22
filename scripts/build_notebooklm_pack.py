from __future__ import annotations

import argparse
import hashlib
import os
from collections import Counter
from pathlib import Path


TEXT_EXTENSIONS = {
    ".md",
    ".markdown",
    ".txt",
    ".html",
    ".htm",
    ".csv",
    ".json",
    ".yaml",
    ".yml",
    ".xml",
    ".log",
    ".rtf",
}

DOCUMENT_EXTENSIONS = {
    ".pdf",
    ".doc",
    ".docx",
    ".ppt",
    ".pptx",
    ".xls",
    ".xlsx",
}


def sha1_prefix(path: Path) -> str:
    h = hashlib.sha1()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()[:12]


def classify(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in TEXT_EXTENSIONS:
        return "text"
    if ext in DOCUMENT_EXTENSIONS:
        return "document"
    return "other"


def human_size(size: int) -> str:
    units = ["B", "KB", "MB", "GB"]
    value = float(size)
    for unit in units:
        if value < 1024 or unit == units[-1]:
            return f"{value:.1f} {unit}" if unit != "B" else f"{int(value)} {unit}"
        value /= 1024
    return f"{size} B"


def collect_sources(source_dir: Path) -> list[dict]:
    rows: list[dict] = []
    for path in sorted(source_dir.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(source_dir)
        row = {
            "name": path.name,
            "relative_path": rel.as_posix(),
            "ext": path.suffix.lower() or "(none)",
            "size": path.stat().st_size,
            "size_human": human_size(path.stat().st_size),
            "type": classify(path),
            "sha1": sha1_prefix(path),
        }
        rows.append(row)
    return rows


def write_manifest(rows: list[dict], out_dir: Path) -> None:
    lines = [
        "# Source Manifest",
        "",
        "## Recommended upload order",
        "1. Primary source documents",
        "2. Clean text notes and transcripts",
        "3. Derived summaries and supporting tables",
        "",
        "## Sources",
    ]
    for row in rows:
        lines.append(
            f"- **{row['name']}** — {row['type']}, {row['ext']}, {row['size_human']}, path `{row['relative_path']}`"
        )
    out_dir.joinpath("source-manifest.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_briefing(rows: list[dict], out_dir: Path) -> None:
    counter = Counter(row["type"] for row in rows)
    lines = [
        "# Notebook Briefing",
        "",
        "## Objective",
        "- Import and organize the provided materials into a NotebookLM-ready research pack.",
        "",
        "## Scope",
        f"- Total files: {len(rows)}",
        f"- Text-like files: {counter.get('text', 0)}",
        f"- Document files: {counter.get('document', 0)}",
        f"- Other files: {counter.get('other', 0)}",
        "",
        "## Important entities",
        "- Fill in topic names, projects, people, and organizations after reviewing the sources.",
        "",
        "## Known gaps",
        "- Dates, authorship, and provenance may still need manual review.",
        "- Duplicate or low-value files should be excluded before final upload when appropriate.",
    ]
    out_dir.joinpath("briefing.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_questions(out_dir: Path) -> None:
    lines = [
        "# Suggested Questions",
        "",
        "- What are the highest-value primary sources in this pack?",
        "- Which files appear redundant or derivative?",
        "- What timeline can be reconstructed from these materials?",
        "- Which claims need direct source verification?",
        "- What information is still missing for a reliable briefing?",
    ]
    out_dir.joinpath("question-set.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_inventory_csv(rows: list[dict], out_dir: Path) -> None:
    header = "name,relative_path,type,ext,size_bytes,sha1_prefix"
    lines = [header]
    for row in rows:
        lines.append(
            ",".join(
                [
                    csv_escape(row["name"]),
                    csv_escape(row["relative_path"]),
                    row["type"],
                    row["ext"],
                    str(row["size"]),
                    row["sha1"],
                ]
            )
        )
    out_dir.joinpath("source-inventory.csv").write_text("\n".join(lines) + "\n", encoding="utf-8")


def csv_escape(value: str) -> str:
    if any(ch in value for ch in [",", "\"", "\n"]):
        return '"' + value.replace('"', '""') + '"'
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a starter NotebookLM source pack from a local folder.")
    parser.add_argument("source_dir", help="Folder containing candidate source files")
    parser.add_argument("--out", help="Output folder for generated artifacts")
    args = parser.parse_args()

    source_dir = Path(args.source_dir).resolve()
    if not source_dir.exists() or not source_dir.is_dir():
        raise SystemExit(f"Source folder not found: {source_dir}")

    out_dir = Path(args.out).resolve() if args.out else source_dir / "notebooklm-pack"
    out_dir.mkdir(parents=True, exist_ok=True)

    rows = collect_sources(source_dir)
    if not rows:
        raise SystemExit(f"No files found under: {source_dir}")

    write_manifest(rows, out_dir)
    write_briefing(rows, out_dir)
    write_questions(out_dir)
    write_inventory_csv(rows, out_dir)

    print(f"Generated NotebookLM starter pack in: {out_dir}")
    print(f"Files scanned: {len(rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
