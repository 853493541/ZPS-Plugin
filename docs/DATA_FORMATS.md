# Addon data and sample map

The samples are user-authored exports for the 丝路风雨 真传 preset package. They configure display and monitoring behavior. They are not a complete game buff database.

| Sample | Addon feature | Editor support |
| --- | --- | --- |
| 剑心目标增强/BuffData.jx3dat | JX BUFF增强, class styling and buff classification | GBK Lua data-table editing |
| 团队气劲/真传（仅）团队气劲.txt | MY 团队 → 气劲设置 → 编辑 | Ordered rule text editing |
| 目标监控/其他辅助.jx3dat | MY target monitor auxiliary preset | Opaque binary, read-only |
| 目标监控/技能监控.jx3dat | MY target monitor skill preset | Opaque binary, read-only |
| 目标监控/自用完整版.jx3dat | MY target monitor combined preset | Opaque binary, read-only |
| 茗伊聊天监控/推荐设置关键词.txt | MY chat monitoring keywords | Ordered keyword editing |
| Instructions and images | User import instructions and visual references | Retained as references |

## JX buff rules

The original `BuffData.jx3dat` uses GBK without BOM, LF, and no trailing newline. Its `tClass` table has 98 string keys. Existing class fields are optional `bEnable`, `bBorderEnable`, `nBorder`, `bFontEnable`, and `nFont`. Their names suggest styling controls; exact appearance is not proven by readable addon code.

The `tBuff` table has 177 numeric buff-ID keys, starting at line 679. Each sample rule has `nClass`, `tLevel`, and `nPower`. `tLevel` mixes implicit Lua indices with explicit keys including zero. It must remain a numeric-keyed Lua table. The final ID 244 has keys including 0, 9, 10, 11, 47, 68, 69, 70, and 71. Do not convert this into a JSON array.

Keep empty and whitespace-only class names. Keep references to missing classes such as 流血. Do not invent defaults for missing optional fields. All sample `nPower` values are 10, but no valid range has been established.

The supplied import instructions specify JX插件集 → BUFF增强 → 导入 → 覆盖. The alternative direct replacement path is `interface/JX#DATA/buffdata/BuffData.jx3dat` while logged out. Export a copy and use the plugin import dialog first.

## MY team rules

The sample uses UTF-8, CRLF, no trailing newline. Line 2 documents pasting the whole document in MY's team buff editor. Comments and separators remain ordered. Selectors include names, numeric IDs, `|mine`, `|lv1`, and `|sn>1`. Other tokens include color literals, parenthesized labels, `#0` through `#9`, and exclamation tokens. Their exact runtime semantics are not established. Display literal flag tokens instead of guessing meanings. Preserve duplicates, variable column counts, unknown tokens, and section text.

## MY chat keywords

The UTF-8 CRLF text contains three skill-name lines, a blank separator, and a longer bandit announcement. Preserve exact text, order and blank lines.

## Evidence and limits

The sample import instructions and `samples/SAMPLES.json` establish sample provenance. `vendor/interface/JX/JX_Buff/info.ini` loads `JX_Buff_Data.lua` and `JX_Buff.lua`. `vendor/interface/MY/MY_TargetMon/info.ini` names its versioned source. Those Lua files and MY_TeamMon/MY_Chat/MY_!Base contain opaque bytes beginning `40 c9 6d 5a 57`. No decryption was attempted. This prevents proving reader internals or binary export structure from the available source.

JX's `data/buff_info.db` is readable SQLite with `buff_type(BuffID, Level, Attrib_1, Value_1, Attrib_2, Value_2, Attrib_3, Value_3)`. It is attribute metadata, not a complete buff-name dictionary. JX3BOX enrichment stays separate from addon configuration. 真传 coverage must be verified rather than silently mapped to a different edition.

Parser and independent Lua checks can prove syntax and preservation. Only importing an exported file into the actual Windows game addon can prove in-game behavior. That check remains required before release.
