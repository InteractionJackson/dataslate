# dataslate

Keep score in your Warhammer 40k games. A mobile-first score keeper built from the Figma frame `data-slate-1` (node 1:124).
Plain HTML/CSS/JS with no build step and no dependencies.

## Run

```bash
python3 -m http.server 8000
# open http://localhost:8000 (or your machine's LAN IP from a phone)
```

On a phone, use "Add to Home Screen" to run it full screen.

## Behaviour

- Round runs 1–5. Command points, Primary and Secondary run 0–99. Buttons disable at the limits.
- Total = Primary + Secondary. It is calculated, so it has no buttons.
- State is saved to `localStorage`, so a reload or a locked phone keeps the score.
- Menu → Undo last change (up to 50 steps) or New game. New game can also be undone from its toast.

## Assets

`assets/` must contain these exports from the Figma file:

| File           | Figma node                                           |
| -------------- | ---------------------------------------------------- |
| `skull.svg`    | 1:127 `ij-skull-neutral`                             |
| `add.svg`      | 1:36 `Interface-Essential / Remove/Add / add`        |
| `subtract.svg` | 1:40 `Interface-Essential / Remove/Add / subtract`   |
| `menu.svg`     | 1:197 `Interface-Essential / Menu / navigation-menu` |

If an icon is missing, the app shows a text glyph (+ / − / ☰) instead. If the skull is missing, its slot is left empty.
