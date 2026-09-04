---
version: 1
slug: "src-index-css"
primary_target: "src/index.css"
related_targets: ["src/App.tsx"]
---

Scope: app-wide visual world replacement (all six tabs, shared chrome). Visitor mode: Operate.

Audience: Phillies fans; phone on game day, desktop for season tables.
Job: one answer per glance — is a game on, who is pitching, how has the season gone.
Constraints: brand-fixed red #E81828 / navy #002D72 / cream #FAF7F0; React 19 + Tailwind v4 CSS-first;
no new deps beyond at most one font; no IA change; both themes required.

## Direction contract

THESIS: The scorecard's ruling is the structural device — hierarchy from rule weight, not from the
radius-and-shadow card currently stamped on every block. Refuses the floating-card dashboard.

OWN-WORLD: Cream stock and ink rules; radius 0; heavy rules bound a section, hairlines separate rows;
tabular figures as the material, columns aligned across panels; notation as vocabulary; red is state
(live, club mark) and never decoration; dark theme is the same ruling in reverse ink.

STORY: The reader sees the day's line first, then the season's, and trusts the figures because the
restraint reads as deliberate.

FIRST VIEWPORT: One ruled masthead — club, date, today's line score on game day — with the nav
directly beneath; the seven stacked blocks above the nav collapse into it. Primary action is the tab row.

FORM: Scorebook; candidate 1 of the ordered grounded list; user-pinned over the assignment; seed key d4860e61.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
