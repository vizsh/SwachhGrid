# Design system: Painted Notice

> Every report is a painted municipal notice, and the city answers in the same paint.

SwachhGrid's look comes from the walls of Nagpur itself. **येथे कचरा टाकू नये** ("don't throw garbage here") is painted by hand on walls across the city's bastis, and Itwari's market signboards use the same flat enamel colours and hand lettering. Residents read that visual language every day, and it is the opposite of both the dark-glass civic dashboard and the green-and-saffron government portal.

The direction was chosen from a set of grounded options on a design decision board. The contract lives in [`.impeccable/surfaces/src-app-page-tsx.md`](../.impeccable/surfaces/src-app-page-tsx.md).

## Palette

Flat enamel sign paint at full strength. Colour owns whole regions; it is never sprinkled as accents on grey.

| Token | Hex | Role |
|---|---|---|
| `chrome` | `#F2B705` | The signboard. Resident app ground, primary actions on dark, live numbers |
| `chrome-deep` | `#D99A00` | Hover and pressed chrome |
| `vermilion` | `#D7372B` | Past deadline, escalation, the stamp's ink |
| `vermilion-deep` | `#A8241B` | Red text on chrome (the hero's English line) |
| `board` | `#14513A` | Municipal board green: crew app ground |
| `board-deep` | `#0D3A29` | Inset panels on green |
| `night` | `#1C2340` | Night board: command centre panels, tally |
| `night-deep` | `#121830` | Command centre ground and insets |
| `night-line` | `#2E3760` | Rules, dividers, inactive tracks on night |
| `ink` | `#16130F` | Paint black: text on chrome, resident plates, buttons |
| `letter` | `#F4F1E8` | Letter white: text on dark boards, the proof card |
| `sign-blue` | `#2F6DB5` | Sign-painter's ultramarine: water categories only |

**Category paints** stay inside this family so the map reads as one painted system: garbage dump chrome, overflowing bin letter white, blocked drain sign blue, stagnant water a blue wash (`#7EAADE`), truck did not come chrome-deep, dead animal vermilion. On the 3D map, a report past its deadline gets a vermilion ring.

**Surface assignments:** landing moves through chrome → board → night → the three paints; the resident app is drenched chrome (road-sign legibility in sunlight); the crew app is board green; the command centre is night indigo (a dim control room).

## Type

| Face | Use | Why |
|---|---|---|
| **Yatra One** (`.painted`) | Marathi and Hindi display, the wordmark, category names | Drawn from Indian hand-painted signs; Devanagari and Latin |
| **Teko** (`.sign`) | Condensed uppercase labels, every number, buttons | Signboard condensed letters; tabular numerals; Devanagari coverage |
| **Mukta** | Body, metadata, form text | Humanist Devanagari + Latin workhorse, readable at small sizes |

Numbers use `tabular-nums` throughout. Display sizes are fluid (`clamp`). Marathi display sits at up to 6 rem on desktop and 38 px on phones.

## Components

- **Signboard** (`.pinstripe`): a flat field with a painted 2 px inset line at 8 px, coloured by `--stripe`.
- **Grain** (`.grain`): an SVG fractal-noise texture at about 9 % alpha, so fields read as painted, not printed.
- **Directory board**: the resident category picker. One ink board with six signboard rows: a paint bar, the Yatra One label, and a chrome icon. Rows are separated by dashed rules, never tiles.
- **Painted button** (`.btn-paint`): Teko uppercase, 4 px corners, solid paint or a 3 px painted outline. Presses down 1 px.
- **Stamp** (`Stamp` in [`paint.tsx`](../src/components/paint.tsx)): vermilion double-ruled rubber stamp, rotated −9°, with a noise mask for uneven ink and `mix-blend-mode: multiply`. Three states: `strike` (animates on mount), `strike={false}` (at rest), or omitted (strikes once when scrolled into view).
- **Custody line** (`CustodyLine`): a painted vertical line through four steps. Done steps are solid dots joined by solid paint; pending steps are open rings on a dashed line. Dark and light tones; labels are localised.
- **Tally**: Teko numerals at 34–72 px with a short label underneath, separated by painted rules. It is one continuous board, not separate tiles.
- **Zone meter**: one identical bar per zone, chrome for open and vermilion for the late share, with the breeding-risk line beneath.
- **Switch**: a pill track that fills chrome when on.
- **Duotone satellite**: satellite tiles through an SVG filter mapping luminance from paint black to deep chrome.

## Motion

Paint is still. Only three things move:

1. **The stamp strike**: 0.55 s, scale 2.1 → 0.94 → 1, blur 3 px → 0, exponential ease-out. This is the signature moment.
2. **Live arrival**: a new report row flashes chrome for 1.4 s in the command centre queue.
3. **Camera flights** in the command centre, at 1.4–1.8 s.

Everything respects `prefers-reduced-motion`.

## Browser surfaces

Text selection is chrome on ink. The caret is chrome. Focus rings are 3 px chrome with a 3 px offset. Scrollbars are thin and night-line coloured. Map credits are restyled as a small translucent paint-black caption instead of a white pill, and are retained as each provider requires.

## Accessibility

- Resident touch targets are at least 44 px; category plates are about 150 px tall.
- Marathi is the default language; all three languages are complete.
- Body text on every ground meets 4.5:1. Red text on chrome uses `vermilion-deep` for contrast.
- Icons always sit beside a text label; colour is never the only signal (late is also written as "late").
- Language buttons use `aria-pressed`; zone tabs use `role="tab"`; the time scrubber exposes `aria-valuetext`.

## Rules

- No glass, no gradients, no neon glow, no icon-card grids as page structure.
- No eyebrow labels above headings.
- Colour fields at page scale; one paint per region.
- Seeded or estimated numbers are labelled where they appear.
