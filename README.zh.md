# dsh-checkdigit · 校验位数学工具箱

DeepSeek Harness 插件：为 **17 种校验位方案**提供生成、验证、修复与识别——Luhn、Verhoeff、Damm、ISBN-10、ISBN-13、EAN-8、EAN-13、UPC-A、GTIN-14、ISSN、ISIN、CUSIP、SEDOL、IBAN、CAS 化学文摘号、ABA 美国银行路由号、NPI 美国医疗提供者号；另带 **ISBN-10 ⇄ ISBN-13 互转**、「单字符修复」搜索工具（「这个号最可能原本是什么？」）与**批量校验工具**（一次校验整列标识符）。

**零运行时依赖**、纯本地整数算术、无网络无外部服务。所有算法按公开规范实现，并与公开标准例交叉验证（Apple `US0378331005`、经典 `GB82 WEST 1234 5698 7654 32`、Luhn 教科书例 `79927398713`、水的 CAS 号 `7732-18-5` 等）。

## 为什么

大模型手算校验位是高频出错点：银行卡号校验和算错、ISBN 通不过校验、IBAN 校验位不可能成立。本插件把这些算术交给确定性代码。

## 安装

```bash
dsh plugin --profile web add github:TYEclipse/dsh-checkdigit
```

安装后在 profile 的 `package.json` 的 `dsh.profile.bundles` 中加入 `"dsh-checkdigit"`（若未自动激活），重启 dsh。

## 六个工具

- `checkdigit_generate` —— 给 payload 计算校验位，返回完整标识符（如 `7992739871` → 校验位 `3` → `79927398713`；`GBWEST12345698765432` → 校验位 `82` → `GB82WEST12345698765432`；`02100002` → `021000021`；`B15KXQ` → `B15KXQ8`；`123456789` → `1234567893`）
- `checkdigit_validate` —— 校验完整标识符；省略 scheme 时自动识别（CAS 连字符式 → ISIN → 9 位 ABA → CUSIP → SEDOL（字母开头）→ IBAN → EAN-13 → UPC-A → ISSN（以 X 结尾）→ EAN-8 → ISBN-10 → Luhn）；出错时返回**期望的校验位**便于程序化修复。空格、连字符、点号一律忽略（`4111 1111 1111 1111`、`978-0-306-40615-7`、`0378-5955` 都能直接校验）。纯数字的 SEDOL 与全部 NPI 因长度与 Luhn/ISBN-10 撞车，需显式指定 scheme
- `checkdigit_repair` —— 值不合法时，枚举能让它合法的**单字符改动**：改校验位、相邻两位互换、改动一个数据位；每条结果都由方案自身的校验器确认，按可能性排序。`total` 给出完整数量，返回列表上限 20 条（`truncated: true`）。IBAN 会同时给出两种合理解释（保留账号重算校验位 / 保留校验位改账号数字）
- `checkdigit_batch` —— **批量校验**：一次 1–50 条（保持粘贴顺序），逐条自动识别（或整列指定 scheme），返回每行结果 + 有效/无效/未识别计数 + 方案分布；空列表或超 50 条直接报 `error` 而不是静默截断
- `checkdigit_info` —— 列出各方案的格式、长度、校验位位置与示例
- `isbn_convert` —— ISBN-10 与 ISBN-13 互转：先验证输入校验位，10→13 加 978 前缀、13→10 仅限 978 前缀（979 无 ISBN-10 等价物），保留输入的连字符分组。如 `0-306-40615-2` → `978-0-306-40615-7`；校验位可为 `X`：`0-8044-2957-X` → `978-0-8044-2957-3`

## 方案一览

| 方案 | 标准 | 说明 |
|------|------|------|
| Luhn | ISO/IEC 7812 | 银行卡、IMEI、会员卡 |
| Verhoeff | — | 二面体群校验，捕获全部单错与相邻换位 |
| Damm | — | 拟群运算，全值计数须为 0 |
| ISBN-10 | ISO 2108 | 模 11，校验位可为 X（=10） |
| ISBN-13 | ISO 2108 | 与 EAN-13 同算术 |
| EAN-8 / EAN-13 | GS1 GTIN | 零售条码 |
| GTIN-14 / SSCC-18 | GS1 GTIN-14 | 物流箱码/托盘码；13 位数据 + 与 EAN/UPC 同款模 10 加权 |
| ISSN | ISO 3297 | 连续出版物号；模 11，校验字符可为 X |
| UPC-A | GS1 GTIN-12 | 北美零售条码 |
| ISIN | ISO 6166 | 证券代码；字母展开 A=10…Z=35 后 Luhn |
| CUSIP | ANSI X9.6 | 北美证券代码；`* @ #` 合法；偶数位加倍 |
| SEDOL | 伦敦证券交易所 | 英/爱证券代码；7 位，权重 1,3,1,7,3,9，字母 A=10…Z=35，不发行元音 |
| IBAN | ISO 13616 | 重排展开后模 97；内置 75+ 国家 BBAN 长度表 |
| CAS Registry Number | CAS | 化学物质号；各位数×从右起位置求和模 10 |
| ABA routing number | 美联储 | 美国银行路由号；3-7-1 加权和模 10 |
| NPI | CMS / 美国 HHS | 美国医疗提供者号；常量前缀 `80840` + 9 位数据做 Luhn，首位为 1 或 2 |

## 开发

```bash
pnpm install
pnpm build
pnpm test   # 119 个测试
pnpm lint
python3 test/oracle/anchors.py   # 所有数值断言的独立出处
```

测试期望值不靠手算：`test/oracle/anchors.py` 用 Python 按公开规范独立实现各方案，并打印测试里断言的每一个锚点（含修复数量与位置）。需要复核时直接运行它。

## 许可

MIT
