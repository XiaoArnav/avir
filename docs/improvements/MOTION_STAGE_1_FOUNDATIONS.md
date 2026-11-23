# AVIR — Motion Design System & Foundations (Stage 1)

## Executive Summary
This document records the design tokens, engineering contracts, and accessible primitives established in Stage 1 of the **AVIR Premium UI & Motion Experience Upgrade**.

Inspired by Apple Weather, Linear, and Vercel, this foundation introduces tactile responsiveness and visual fluidity across Avir while strictly preserving mathematical and scientific data integrity.

---

## 1. Core Engineering Directives & Zero-Fabrication Guarantees
- **Zero Fabrication**: Motion primitives never fabricate intermediate sensor values or animate fake AQI reading tickers (e.g. rolling from 0 to 350). Values update via clean crossfades (`ValueCrossfade`).
- **Reduced Motion Compliance**: System-wide `MotionProvider` configures `reducedMotion="user"`, automatically nullifying motion transformations for users with `prefers-reduced-motion: reduce`.
- **Public Seam Contract**: All motion tokens and primitives are exported from `@/components/motion` and `@/lib/motion-tokens`.

---

## 2. Motion Tokens (`src/lib/motion-tokens.ts`)

### Durations
| Token | Value | Purpose |
| :--- | :--- | :--- |
| `duration.instant` | `0.10s` | Immediate micro-feedback and exit animations |
| `duration.fast` | `0.18s` | Button clicks, tab indicators, hover states |
| `duration.base` | `0.28s` | Standard UI card reveals, dropdowns, sheet transitions |
| `duration.smooth` | `0.42s` | Dialog entrances, hero transitions, chart reveals |
| `duration.slow` | `0.65s` | Deep atmospheric gradient and ambient crossfades |

### Easing & Springs
- **Apple/Linear Responsive Curve**: `[0.16, 1, 0.3, 1]` (`easing.apple`)
- **Snappy Spring**: `{ type: 'spring', stiffness: 420, damping: 32 }` (`springs.snappy`)
- **Gentle Spring**: `{ type: 'spring', stiffness: 260, damping: 26 }` (`springs.gentle`)
- **Atmospheric Spring**: `{ type: 'spring', stiffness: 110, damping: 22 }` (`springs.atmospheric`)

---

## 3. Reusable Motion Primitives (`src/components/motion/`)

1. **`MotionProvider`**: Global wrapper in `RootLayout` enforcing user reduced-motion preferences.
2. **`FadeIn`**: Directional reveal (`up`, `down`, `left`, `right`, `none`) with custom timing.
3. **`SlideUp`**: Soft spring elevation reveal.
4. **`StaggerContainer` & `StaggerItem`**: Coordinated cascading animations for telemetry grids and lists.
5. **`SpringCard`**: Interactive glass-morphism card with subtle lift on hover and tactile press down.
6. **`ValueCrossfade`**: Scientific data crossfade that transitions readings without fake intermediate numbers.

---

## 4. Verification Evidence
- **Test Suite**: `tests/unit/motion-system.test.tsx` (11 unit tests passing in 7ms).
- **TypeScript**: 0 errors (`npx tsc --noEmit`).
- **Next.js Production Build**: Clean build in 1,482ms (`npm run build`).
- **Full Suite**: 68 test files, 1,225 tests passing in 7.11s.
