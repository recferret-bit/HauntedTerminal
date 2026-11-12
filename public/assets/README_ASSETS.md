# Haunted Terminal — Спецификация PNG-ассетов (Comix Zone Style)

Положи прозрачные `.png` файлы в `public/assets/sprites/` и нажми **Hot-Reload Assets** в правой панели (`F2`). Сцена — процедурные 3D-меши и шейдеры (Three.js). Если PNG есть, он ложится альбедо-картой на меш с тем же ключом.

| Ключ манифеста | Путь к файлу | Рекомендуемый размер | Anchor | Стиль |
|---|---|---|---|---|
| `hero` | `/assets/sprites/hero.png` | `128x192 px` | `[0.5, 0.9]` | Разработчик в худи с фонарем, жирный контур тушью 4px |
| `system_hand` | `/assets/sprites/system_hand.png` | `256x256 px` | `[0.15, 0.85]` | Рука художника со стилусом/пером, рисующая сверху листа |
| `necromancer_boss` | `/assets/sprites/necromancer_boss.png` | `256x256 px` | `[0.5, 0.85]` | Многорукий демон котельной PID 666 |
| `zombie_worker` | `/assets/sprites/zombie_worker.png` | `128x128 px` | `[0.5, 0.85]` | Мелкий зомби-процесс с биркой PID |
| `locked_gate` | `/assets/sprites/locked_gate.png` | `160x220 px` | `[0.5, 0.9]` | Кованая готическая решетка с навесным замком `rwx` |
| `poltergeist` | `/assets/sprites/poltergeist.png` | `128x128 px` | `[0.5, 0.5]` | Полупрозрачный призрак-дотфайл `.poltergeist.lock` |
| `gargoyle` | `/assets/sprites/gargoyle.png` | `192x192 px` | `[0.5, 0.9]` | Каменная крылатая горгулья `0555` |
| `crate_bridge` | `/assets/sprites/crate_bridge.png` | `160x96 px` | `[0.5, 0.8]` | Деревянный архивный ящик `heavy_plank.tar` |
| `mirror_door` | `/assets/sprites/mirror_door.png` | `160x220 px` | `[0.5, 0.9]` | Треснувшее зеркало симлинка |
| `black_hole` | `/assets/sprites/black_hole.png` | `192x192 px` | `[0.5, 0.5]` | Вихрь гравитации `/dev/null` |
| `socket_guardian` | `/assets/sprites/socket_guardian.png` | `160x192 px` | `[0.5, 0.85]` | Говорящий каменный череп-переговорник `*.sock` |
| `item_scroll` | `/assets/sprites/item_scroll.png` | `96x96 px` | `[0.5, 0.8]` | Свиток / лог-файл `readme.txt` |
