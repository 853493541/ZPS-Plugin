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

Keep empty and whitespace-only class names. Keep references to missing classes such as 流血. Do not invent defaults for missing optional fields. Studio shows the five class settings with the addon's own labels (启用, 启用自定义边框, 启用自定义字体) plus the border and font numbers. A setting the file lacks shows as 未设置 and is written only when the user sets it. New classes default to all three switches on, border 1 and font 159, and the create dialog lets the user change them.

Border previews use `app/ui/borders/border_<nBorder>.png`, copied unchanged from the user's `853493541/zhenchuan` repository (`frontend/public/Borders`, commit e8a0db1). The user recreated these from the game for that project. Images exist for 1, 7, 9, 10, 11, 12, 13, 14 and 45. The sample also uses 61, which has no image and shows its number instead. `nFont` previews are not available because no font-scheme source has been provided. All sample `nPower` values are 10, but no valid range has been established.

The supplied import instructions specify JX插件集 → BUFF增强 → 导入 → 覆盖. The alternative direct replacement path is `interface/JX#DATA/buffdata/BuffData.jx3dat` while logged out. Export a copy and use the plugin import dialog first.

## MY team rules

The sample uses UTF-8, CRLF, no trailing newline. Line 2 documents pasting the whole document in MY's team buff editor. Comments and separators remain ordered. Selectors include names, numeric IDs, `|mine`, `|lv1`, and `|sn>1`. Other tokens include color literals, parenthesized labels, `#0` through `#9`, and exclamation tokens. Their exact runtime semantics are not established. Display literal flag tokens instead of guessing meanings. Preserve duplicates, variable column counts, unknown tokens, and section text.

## MY chat keywords

The UTF-8 CRLF text contains three skill-name lines, a blank separator, and a longer bandit announcement. Preserve exact text, order and blank lines.

## Evidence and limits

The sample import instructions and `samples/SAMPLES.json` establish sample provenance. `vendor/interface/JX/JX_Buff/info.ini` loads `JX_Buff_Data.lua` and `JX_Buff.lua`. `vendor/interface/MY/MY_TargetMon/info.ini` names its versioned source. Those Lua files and MY_TeamMon/MY_Chat/MY_!Base contain opaque bytes beginning `40 c9 6d 5a 57`. No decryption was attempted. This prevents proving reader internals or binary export structure from the available source.

JX's `data/buff_info.db` is readable SQLite with `buff_type(BuffID, Level, Attrib_1, Value_1, Attrib_2, Value_2, Attrib_3, Value_3)`. It is attribute metadata, not a complete buff-name dictionary. JX3BOX enrichment stays separate from addon configuration. 真传 coverage must be verified rather than silently mapped to a different edition.

Parser and independent Lua checks can prove syntax and preservation. Only importing an exported file into the actual Windows game addon can prove in-game behavior. That check remains required before release.

## Feature workspaces

The application has one tab per addon feature, defined in `app/ui/features.mjs`. The sample groups contain one JX BUFF preset, one MY team-buff preset, three MY target-monitor presets, and one chat-keyword preset. Each tab shows its own sample list and original addon import destination. Target-monitor presets remain opaque and read-only. Their grouping does not establish their individual internal rules or that the complete preset is a union of the other two.

`app/core/feature-sessions.mjs` retains a separate byte-owned editing session per feature. Switching tabs preserves applied changes, undo history, saved-byte comparisons, and dirty state. The renderer separately retains search, selected record, inspector tab, metadata edition/level, and unapplied form drafts. Opening a new document routes it by parsed kind and asks before replacing a dirty destination session. Desktop close and replacement guards consider inactive dirty sessions and unapplied drafts as well as the active one. Drafts have a separate flag and are not exported until applied. Update installation waits for unapplied drafts to be applied or cleared.

The preview uses the same session model and requires confirmation before replacing dirty documents. It still cannot export native files. Unknown opaque input opens read-only in the target-monitor workspace; classification as opaque is not proof of a valid MY binary preset.
