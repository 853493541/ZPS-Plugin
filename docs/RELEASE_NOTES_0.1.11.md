# ZPS Studio 0.1.11

A cleaner workspace and faster type editing in BUFF增强.

- **Updates** appear only in the bottom-left corner, and only when a new version is found. 检查更新 and 反馈问题 are gone, and nothing shows when you are up to date.
- **File tabs** no longer have a close ×. Right-click a tab for 复制为新版本, 导出 and 关闭. 关闭 still asks before discarding unexported changes. Ctrl+S exports.
- **复制为新版本** copies the file, including applied edits, into a new tab with a version name you choose. The original stays unchanged.
- The "版本未标注" placeholder is gone. A version name shows only when a file has one.
- **Types** are split into 默认 and 自定义 tabs. 默认 lists the plugin's 22 built-in types and the buffs your file puts in them. 自定义 holds the types your file defines, and is where you create new ones.
- **Type settings** are simpler: no hint text, bigger border previews without numbers, and font choices from the styles your file uses, plus 其他.
- **Buffs** show several per row, with the level after the ID, for example `27038,0,1`. The buff search bar is gone.
- **Drag a buff** onto a type in the left list to move it there. 撤销 undoes it.

Font previews are still not available. Plugin data formats are unchanged.
