---
version: 1
slug: "src-index-css"
primary_target: "src/index.css"
related_targets: ["src/App.tsx"]
---

Scope: app-wide visual world replacement (all six tabs, shared chrome). Visitor mode: Operate.

Audience: Phillies fans; phone on game day in a dim room with the game on TV, desktop for season tables.
Job: one answer per glance — is a game on, who is pitching, how has the season gone.
Constraints: brand-fixed red #E81828 / navy #002D72; React 19 + Tailwind v4 CSS-first; one new font at most;
no IA change; both themes required; every panel keeps its own fetch and self-hiding behaviour.

## Direction contract

THESIS: The app is the instrument that MEASURES the game, not the paper that records it. Refuses the
ledger pastiche it replaces and the neutral card dashboard.

OWN-WORLD: A dark plotting canvas biased blue-black; panels are plot surfaces seated on a ruled grid;
one diverging measurement scale runs cool blue → club red, so the brand red is the scale's hot end
rather than decoration; tabular figures in Archivo are the material; radius is small and precise, not 0;
red stays state. Light theme is the same instrument in daylight — cool neutral, never cream.

STORY: The reader sees the day measured, then the season measured, and trusts the figures because
everything is plotted against one visible scale.

FIRST VIEWPORT: Thin instrument bar over the canvas; the live-or-next game as a measured readout;
segmented nav on the grid; dense plotted tables below.

SIGNATURE INTERACTION: the sorted column holds a persistent vertical tint band — a plot cursor that
tracks the reader's eye across a seventeen-column table. Motion is mechanical: ~140ms, exponential
ease-out, reduced-motion honoured.

FORM: Statcast / Baseball Savant data-graphics language; candidate 5 of 7; seed key c0ae1052.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
