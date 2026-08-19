# dsh-checkdigit · 校验位数学工具箱

DeepSeek Harness 插件：为 **11 种校验位方案**提供生成、验证与识别——Luhn、Verhoeff、Damm、ISBN-10、ISBN-13、EAN-8、EAN-13、UPC-A、ISIN、CUSIP、IBAN。

**零运行时依赖**、纯本地整数算术、无网络无外部服务。所有算法按公开规范实现，并与公开标准例交叉验证（Apple `US0378331005`、经典 `GB82 WEST 1234 5698 7654 32`、Luhn 教科书例 `79927398713` 等）。

## 为什么

大模型手算校验位是高频出错点：银行卡号校验和算错、ISBN 通不过校验、IBAN 校验位不可能成立。本插件把这些算术交给确定性代码。

## 安装

```bash
dsh plugin --profile web add github:TYEclipse/dsh-checkdigit
```

安装后在 profile 的 `package.json` 的 `dsh.profile.bundles` 中加入 `"dsh-checkdigit"`（若未自动激活），重启 dsh。

## 三个工具

- `checkdigit_generate` —— 给 payload 计算校验位，返回完整标识符（如 `7992739871` → 校验位 `3` → `79927398713`；`GBWEST12345698765432` → 校验位 `82` → `GB82WEST12345698765432`）
- `checkdigit_validate` —— 校验完整标识符；省略 scheme 时自动识别（ISIN → CUSIP → IBAN → EAN-13 → UPC-A → EAN-8 → ISBN-10 → Luhn）；出错时返回**期望的校验位**便于程序化修复
- `checkdigit_info` —— 列出各方案的格式、长度、校验位位置与示例

## 方案一览

| 方案 | 标准 | 说明 |
|------|------|------|
| Luhn | ISO/IEC 7812 | 银行卡、IMEI、会员卡 |
| Verhoeff | — | 二面体群校验，捕获全部单错与相邻换位 |
| Damm | — | 拟群运算，全值计数须为 0 |
| ISBN-10 | ISO 2108 | 模 11，校验位可为 X（=10） |
| ISBN-13 | ISO 2108 | 与 EAN-13 同算术 |
| EAN-8 / EAN-13 | GS1 GTIN | 零售条码 |
| UPC-A | GS1 GTIN-12 | 北美零售条码 |
| ISIN | ISO 6166 | 证券代码；字母展开 A=10…Z=35 后 Luhn |
| CUSIP | ANSI X9.6 | 北美证券代码；`* @ #` 合法；偶数位加倍 |
| IBAN | ISO 13616 | 重排展开后模 97；内置 75+ 国家 BBAN 长度表 |

## 开发

```bash
pnpm install
pnpm build
pnpm test   # 51 个测试，锚点与公开标准例交叉验证
pnpm lint
```

## 许可

MIT
