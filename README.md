# Codex NotebookLM 技能

一个用于整理 NotebookLM 输入资料的 Codex skill 骨架。

## 当前内容

- `SKILL.md`：技能定义与工作流
- `references/notebooklm-workflow.md`：详细检查清单与输出模板
- `scripts/build_notebooklm_pack.py`：从本地资料目录生成 NotebookLM 初始资料包
- `agents/openai.yaml`：UI 元数据

## 适合的场景

- 把零散网页/PDF/会议纪要整理成 NotebookLM 可用资料包
- 生成导入顺序、摘要、问题清单、时间线、术语表
- 做研究型知识库的来源清洗与归档

## 快速使用

```powershell
python .\scripts\build_notebooklm_pack.py <你的资料目录>
```

默认会在资料目录下生成 `notebooklm-pack`，包含：

- `source-manifest.md`
- `briefing.md`
- `question-set.md`
- `upload-plan.md`
- `duplicate-candidates.md`
- `source-inventory.csv`
