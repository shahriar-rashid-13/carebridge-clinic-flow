# 3D Vibrant Design Report

**Date:** September 25, 2026
**Scope:** Tactile ("3D") buttons and cards plus a more diverse palette, modelled on fisfis.cc. Vibrant theme only; the calm theme is unchanged.

## How fisfis.cc does it (measured from computed styles)

| Element | Fill | Border | Shadow | Press |
|---|---|---|---|---|
| Primary CTA | `#fe976c` solid | 1px `#1a1c1e` | `3px 3px 0 #1a1c1e` | `translate(2px,2px)`, shadow removed |
| Secondary button | white | 1px `#1a1c1e` | `2px 2px 0 #1a1c1e` | same |
| Mode chips | light pastels (`#e1f7fe`, `#f7dcf5`, `#e4f3ea`) | 1px tinted | `2px 2px 0 #1a1c1e` | same |
| Cards | white | 1px `#1a1c1e` | `5px 5px 0 #1a1c1e` | none |

Text is always dark ink. There are no gradients, no blur and no pseudo-element layers. The depth comes from the hard offset shadow alone.

## What was wrong in the first attempt

1. **Gray panels.** `.card-3d` used `transform-style: preserve-3d` plus a `::before` with `background: inherit; filter: brightness(0.85)` at `z-index: -1`. `preserve-3d` creates a stacking context, so the darkened layer rendered *above* the panel's white background and turned every panel gray.
2. **Blurry, soft shadows and gradients.** The first attempt used `linear-gradient` fills and blurred `rgba` shadows. That looked like generic Material/glass design, not a tactile surface.
3. **White text on pastels.** Stat cards and pastel buttons used white text, which had poor contrast and looked washed out.
4. **No outline.** Without the thin ink border the shapes had no crisp edge.

## Current implementation

- `src/styles.css`
  - New vibrant tokens: `--ink-strong: #1a1c1e` and `--pop-terracotta`, `--pop-mist`, `--pop-rose`, `--pop-sage`, `--pop-sand` and `--pop-lavender`.
  - `.btn-3d`: 1px ink border, `3px 3px 0` ink shadow, dark text. Hover lifts by 1px (shadow 4px). Active presses by `translate(3px,3px)` and removes the shadow. The easing curve is copied from fisfis.
  - `.btn-3d-*`: solid fills from the pop tokens. Primary stays forest green with white text.
  - `.card-3d`: 1px ink border, `5px 5px 0` ink shadow, 16px radius, no pseudo-elements.
  - `.stat-card-*`: solid pastel fills.
  - `prefers-reduced-motion` disables the button movement.
- `src/components/ui/button.tsx`: the 3D variants no longer force `text-white` or `border-0`.
- `src/components/clinic/page.tsx`: StatCard text uses dark ink in vibrant mode.
- `src/routes/index.tsx`: landing role and feature cards use `.card-3d` in vibrant mode.

Where it is used: landing page CTAs and cards, dashboard stat cards, panels and header buttons for all three roles, login and signup buttons, and the AI chat new-chat button, send button and prompt chips.

## Verification

- `npm run build` passes.
- Visually checked the vibrant patient dashboard on localhost: pastel outlined stat cards, white outlined panels (no gray) and an outlined primary button.
