# Renderer styling contract

`@nyven-stream/renderer` uses Tailwind-oriented utility class names and CSS variables.

## Required host theme tokens

Provide these colors (Tailwind theme or CSS):

| Token | Role | Example |
|-------|------|---------|
| `nyven-300` … `nyven-600` | Accent | `#7cc5fb` … `#006fc5` |
| `surface` | Page background | `#0b0f19` |
| `surface-raised` | Cards | `#121826` |
| `slate-*` | Neutral text/borders | Tailwind slate palette |

## CSS entry

```ts
import "@nyven-stream/renderer/styles.css";
```

Defines `--ns-*` variables, reduced-motion rules, and caret/pulse animations.

## Tailwind content

If the host uses Tailwind, scan the renderer package:

```js
content: [
  "./src/**/*.{ts,tsx}",
  "../../packages/renderer/src/**/*.{ts,tsx}",
]
```

The playground already does this.

## Standalone reliability

The playground defines the full NYVEN palette in `tailwind.config.js` and imports renderer `styles.css`, so styles are consistent when run independently.
