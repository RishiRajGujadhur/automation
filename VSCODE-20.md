# VS Code features with their settings (V1–V20)

Twenty VS Code editor and workbench features, each with the settings VS Code has for it (same ids, e.g.
`editor.minimap.enabled`). They are listed under **Settings ▸ Text Editor** and **Settings ▸ Workbench** (Ctrl+,),
by sub-category as in VS Code: a changed setting has a bar on its left and a reset button, `@modified` lists the changed
ones, and **Settings (JSON)** copies or imports them as a `settings.json`. A feature's own `enabled` setting is its
switch. Web and desktop share the implementation.

| # | Feature | Settings | Status |
| --- | --- | --- | --- |
| V1 | Settings editor (Text Editor / Workbench categories, modified bar, reset, @modified, settings.json) and Line Numbers | editor.lineNumbers | ✅ 2026-10-20 |

## Progress log
- 2026-10-20 V1: Schema-driven VS Code settings with sub-categories, modified marker, reset, @modified and settings.json copy/import; editor.lineNumbers on / off / relative / interval; Ctrl+, opens Preferences in the web app.
