# Chapter editor: tasks

- [x] 1. Dev API: list, write (whitelist, atomic), render comix. _Req 1, 7, 9_
- [x] 2. Canonical JSON writer reproducing existing files. _Req 7_
- [x] 3. Field tables and the generic form renderer. _Req 2_
- [x] 4. App shell: chapter select, level list, tabs, URL state, save, revert, Ctrl+S. _Req 1, 3, 7_
- [x] 5. Preview iframe on the draft; transport controls; event log; per-step play; raw events. _Req 4, 5_
- [x] 6. Check tab: static checks, asset ids, field-table check, headless solve. _Req 6_
- [x] 7. Etag conflict detection, reload from disk, disk polling. _Req 8_
- [x] 8. API hardening: local host, same origin, JSON content type, existing files only, object bodies. _Req 9_
- [x] 9. Read-only fallback from the compiled catalog. _Req 10_
- [x] 10. Accessibility pass: roles, labels, live regions, screen-reader text. _Req 11_
- [x] 11. `editor-smoke.mjs` in headless Chrome. _Req 1-9_
- [ ] 12. Add / delete / reorder levels (updates manifest `levels[]`, folder, indices).
- [ ] 13. Undo/redo per file; side-by-side diff against disk before save.
- [ ] 14. Per-field locks (`lockedPaths`) so agents never regenerate hand-tuned fields; today the rule is "read from disk, patch only what the task names".
- [ ] 15. Dialogue preview anchored on the real socket inode (today anchors on inode 0).
- [ ] 16. Keyboard reordering for list items (buttons exist; add shortcuts) and a manual screen-reader pass.
