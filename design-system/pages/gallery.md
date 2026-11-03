# 사진첩 (gallery) — page override

Brief: "애플 사진첩 보는 것처럼". The brief pins the visual grammar, so this page follows iOS/macOS Photos and keeps the board's existing tokens (Pretendard, `--ac` teal, `--bg/--card/--ink`).

## Tokens used
- Surfaces: `--bg` page, `--line` image placeholder. Viewer: `--gv-bg` #fff light / #000 dark, #000 when chrome is hidden.
- Type: Pretendard only. Large title 30/800 (album), 22/800 (section), album name 15/600, counts 13/500 `--sub`.
- Radius: album covers 10px. Photo tiles 0 (edge-to-edge, Photos style). No shadows on photos.
- Gap: grid 2px desktop, 1.5px mobile.

## Layout
- 사진첩 home: segmented `앨범 | 모든 사진` + round `＋` button. Albums = square single cover + name + count (2 cols phone, auto-fill 190px desktop).
- 모든 사진: every photo of every album, grouped under album headers (Photos' date headers become album headers, since Drive links carry no dates).
- Album: back, large title, count; grid square tiles, column density −/＋ (phone 3/5, desktop 4/6/8), remembered per device.

## Signature
The viewer: the tapped tile flies open into the full photo (shared-element), photos follow the finger on swipe, pull down to dismiss back into its tile, filmstrip scrubber at the bottom, tap to hide chrome (background goes black). Thumbnail shows instantly, full resolution swaps in.

## Avoided
- Cards with shadows/collages for albums (previous version) — Photos uses one cover photo.
- Rounded/hover-scaled photo tiles, name overlays on tiles.
- Toolbar-heavy viewer (the chat's review viewer stays for originals).

## Quality floor
Keyboard ←/→/Esc, focus returns to tile, `prefers-reduced-motion` disables flights/slides, buttons ≥44px on touch, back button closes viewer.
