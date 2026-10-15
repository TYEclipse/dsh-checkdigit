# CHANGELOG · dsh-checkdigit

> 版本口径：patch 修 bug/补测试｜minor 新增用户可见功能｜major 破坏性变更。安装：`dsh plugin --profile web add github:TYEclipse/dsh-checkdigit`

## [0.4.0] — 2026-10-16
### Minor · R71
- [自主进化] R71 新增 sedol（伦敦证交所 7 位证券代码，权重 1,3,1,7,3,9）与 npi（美国医疗提供者号，常量前缀 80840 做 Luhn）两个方案 + checkdigit_batch 批量校验工具（1-50 条，逐行结果 + 计数 + 方案分布）；oracle 迁到仓内并补 sedol/npi/批量锚点与自检

## [0.3.0] — 2026-09-27
### Minor · R51
- [自主进化] R51 新增 checkdigit_repair（单字符修复搜索）+ ISSN/GTIN-14 方案 + 分隔符一律忽略

## [0.2.3] — 2026-09-11
### Patch · R31
- [自主进化] 接入版本与覆盖率门禁（工具链）

## [0.2.2] — 2026-09-11
### Patch · R31
- [自主进化] 接入版本与覆盖率门禁（工具链）

## [0.2.1] — 2026-09-11
### Patch · R31
- [自主进化] 接入版本与覆盖率门禁（工具链）

