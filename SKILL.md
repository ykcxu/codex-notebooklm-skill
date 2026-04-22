---
name: codex-notebooklm-skill
description: Prepare, restructure, and quality-check source materials for NotebookLM research workflows. Use when Codex needs to turn raw notes, web research, transcripts, PDFs, Markdown, copied articles, meeting notes, exported chats, or mixed folders into NotebookLM-ready source packs, reading lists, import checklists, concise summaries, question sets, briefing docs, timelines, glossaries, citation maps, or citation-friendly knowledge bases. Trigger on requests such as "organize NotebookLM materials", "build a NotebookLM import pack", "turn these PDFs, web notes, and docs into research material", "generate a Q&A outline", or "create an upload-ready knowledge pack".
---

# Codex NotebookLM Skill

## Overview

Turn messy research inputs into a clean NotebookLM workflow.
Normalize sources, remove duplication, preserve provenance, and produce outputs that are easy to import, review, and reuse.

## Quick Start

1. Inventory the available source files and formats.
2. Classify each item as primary source, supporting source, or noise.
3. Normalize filenames, titles, and metadata before summarizing.
4. Produce a compact source manifest and a NotebookLM-ready briefing.
5. Keep every claim traceable back to a concrete source.

## Trigger Hints

Use this skill immediately when the user asks to:

- organize NotebookLM materials
- generate a NotebookLM import pack
- combine PDFs, Markdown, and web notes into research material
- create summaries, question sets, timelines, or glossaries from a source bundle
- clean a messy folder so it becomes suitable for knowledge-base or research Q&A use

Do not overcomplicate the first pass.
Prefer a narrow but complete source pack over a bloated archive.

## Default Workflow

### 1. Build a source inventory

- List the source files, URLs, transcripts, or notes provided by the user.
- Record the file type, rough topic, time range, and source reliability.
- Flag duplicates, partial exports, generated summaries, and obviously stale material.
- Prefer original documents over downstream summaries when both exist.

### 2. Clean and organize inputs

- Normalize titles so they are readable and consistent.
- Group sources by topic, time period, or research question.
- Separate raw source material from derived notes.
- Preserve original wording for quoted evidence, but avoid carrying over irrelevant boilerplate.

### 3. Prepare NotebookLM-ready outputs

Produce only the artifacts needed for the request. Common outputs:

- `source-manifest.md`: ordered source list with one-line descriptions
- `briefing.md`: concise context memo for the notebook
- `question-set.md`: research questions the user can ask inside NotebookLM
- `upload-plan.md`: recommended upload sequence by priority
- `duplicate-candidates.md`: exact duplicate-content candidates for cleanup
- `timeline.md`: key events in date order
- `glossary.md`: entities, acronyms, and definitions
- `citation-map.md`: notable claims mapped to source names

### 4. Enforce provenance

- Tie major claims to named sources.
- Call out uncertainty, missing dates, and unsupported conclusions.
- Distinguish source text from your synthesis.
- If two sources conflict, report the conflict instead of silently merging them.

### 5. Final review

Before finishing:

- Check that filenames and headings are human-readable.
- Check that summaries stay faithful to the inputs.
- Check that the user can tell what to upload first.
- Check that the final output is compact enough to scan quickly.

## Output Rules

- Prefer Markdown unless the user requests another format.
- Lead with the most important materials first.
- Use short sections and bullets instead of long narrative blocks.
- Keep each deliverable self-contained.
- If you create multiple files, include a short recommended upload order.

## Resource Usage

- Read `references/notebooklm-workflow.md` when you need the detailed checklist, artifact templates, or a recommended output layout.
- Use `scripts/build_notebooklm_pack.py` when the user provides a local folder and needs a fast, repeatable first-pass source inventory plus starter Markdown artifacts.
- Use `scripts/upload_to_notebooklm.js` when the user wants browser-based automatic upload into NotebookLM from a local folder.
- Prefer append mode plus a stable notebook URL when the user wants repeatable uploads into the same notebook.
- Keep `SKILL.md` lean; put expanded guidance in references instead of repeating it here.
