from __future__ import annotations

import argparse
import hashlib
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
        parent = rel.parent.as_posix() if rel.parent.as_posix() != "." else "(root)"
        stat = path.stat()
        row = {
            "name": path.name,
            "relative_path": rel.as_posix(),
            "parent_folder": parent,
            "ext": path.suffix.lower() or "(none)",
            "size": stat.st_size,
            "size_human": human_size(stat.st_size),
            "type": classify(path),
            "sha1": sha1_prefix(path),
        }
        row["priority"] = score_priority(row)
        rows.append(row)
    return rows


def score_priority(row: dict) -> str:
    ext = row["ext"]
    kind = row["type"]
    if kind == "document" and ext == ".pdf":
        return "high"
    if kind == "text" and ext in {".md", ".txt", ".html", ".htm"}:
        return "high"
    if kind == "document":
        return "medium"
    if kind == "text":
        return "medium"
    return "low"


def group_counts(rows: list[dict], key: str) -> list[tuple[str, int]]:
    return sorted(Counter(row[key] for row in rows).items(), key=lambda item: (-item[1], item[0]))


def find_duplicates(rows: list[dict]) -> dict[str, list[dict]]:
    dup_map: dict[str, list[dict]] = {}
    for row in rows:
        dup_map.setdefault(row["sha1"], []).append(row)
    return {digest: items for digest, items in dup_map.items() if len(items) > 1}


def write_manifest(rows: list[dict], out_dir: Path) -> None:
    ordered = sorted(rows, key=lambda row: (priority_rank(row["priority"]), row["type"], row["relative_path"]))
    lines = [
        "# Source Manifest",
        "",
        "## Recommended upload order",
        "1. High-priority primary documents and core text notes",
        "2. Medium-priority supporting documents",
        "3. Low-priority leftovers after manual review",
        "",
        "## Sources",
    ]
    for row in ordered:
        lines.append(
            f"- **{row['name']}** — {row['type']}, {row['ext']}, {row['size_human']}, priority {row['priority']}, path `{row['relative_path']}`"
        )
    out_dir.joinpath("source-manifest.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_briefing(rows: list[dict], out_dir: Path) -> None:
    counter = Counter(row["type"] for row in rows)
    duplicates = find_duplicates(rows)
    by_ext = group_counts(rows, "ext")
    by_folder = group_counts(rows, "parent_folder")
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
        "## Collection shape",
        "- Top file extensions:",
    ]
    for ext, count in by_ext[:8]:
        lines.append(f"  - `{ext}`: {count}")
    lines.extend(
        [
            "- Top folders:",
        ]
    )
    for folder, count in by_folder[:8]:
        lines.append(f"  - `{folder}`: {count}")
    lines.extend(
        [
            "",
            "## Duplicate check",
            f"- Duplicate content groups: {len(duplicates)}",
        ]
    )
    if duplicates:
        for _, items in list(duplicates.items())[:10]:
            sample = ", ".join(f"`{item['relative_path']}`" for item in items[:3])
            lines.append(f"- Same-content files: {sample}")
    lines.extend(
        [
            "",
        "## Important entities",
        "- Fill in topic names, projects, people, and organizations after reviewing the sources.",
        "",
        "## Known gaps",
        "- Dates, authorship, and provenance may still need manual review.",
        "- Duplicate or low-value files should be excluded before final upload when appropriate.",
        ]
    )
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


def write_upload_plan(rows: list[dict], out_dir: Path) -> None:
    ordered = sorted(rows, key=lambda row: (priority_rank(row["priority"]), row["type"], row["relative_path"]))
    lines = [
        "# Upload Plan",
        "",
        "## Upload first",
    ]
    first = [row for row in ordered if row["priority"] == "high"][:20]
    second = [row for row in ordered if row["priority"] == "medium"][:20]
    third = [row for row in ordered if row["priority"] == "low"][:20]
    for row in first:
        lines.append(f"- `{row['relative_path']}`")
    if second:
        lines.extend(["", "## Upload after first pass"])
        for row in second:
            lines.append(f"- `{row['relative_path']}`")
    if third:
        lines.extend(["", "## Review before upload"])
        for row in third:
            lines.append(f"- `{row['relative_path']}`")
    out_dir.joinpath("upload-plan.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_duplicates(rows: list[dict], out_dir: Path) -> None:
    duplicates = find_duplicates(rows)
    lines = [
        "# Duplicate Candidates",
        "",
        f"- Duplicate groups found: {len(duplicates)}",
    ]
    if not duplicates:
        lines.append("- No exact duplicate content detected.")
    else:
        for digest, items in sorted(duplicates.items(), key=lambda item: (-len(item[1]), item[0])):
            lines.extend(["", f"## SHA1 {digest}"])
            for item in items:
                lines.append(f"- `{item['relative_path']}` ({item['size_human']})")
    out_dir.joinpath("duplicate-candidates.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_inventory_csv(rows: list[dict], out_dir: Path) -> None:
    header = "name,relative_path,parent_folder,type,ext,size_bytes,priority,sha1_prefix"
    lines = [header]
    for row in rows:
        lines.append(
            ",".join(
                [
                    csv_escape(row["name"]),
                    csv_escape(row["relative_path"]),
                    csv_escape(row["parent_folder"]),
                    row["type"],
                    row["ext"],
                    str(row["size"]),
                    row["priority"],
                    row["sha1"],
                ]
            )
        )
    out_dir.joinpath("source-inventory.csv").write_text("\n".join(lines) + "\n", encoding="utf-8")


def csv_escape(value: str) -> str:
    if any(ch in value for ch in [",", "\"", "\n"]):
        return '"' + value.replace('"', '""') + '"'
    return value


def priority_rank(priority: str) -> int:
    return {"high": 0, "medium": 1, "low": 2}.get(priority, 3)


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
    write_upload_plan(rows, out_dir)
    write_duplicates(rows, out_dir)
    write_inventory_csv(rows, out_dir)

    print(f"Generated NotebookLM starter pack in: {out_dir}")
    print(f"Files scanned: {len(rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
