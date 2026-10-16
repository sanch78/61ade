# Kötelező VAPA-fejlesztési szabályok

@AGENTS.md

Első és legfontosabb szabály: nincs a VAPA-t megkerülő egyedi fejlesztés. Hiányzó képességhez előbb a keretrendszer eszközeit kell bővíteni. Kivétel kizárólag az AGENTS.md 1. pontja szerint, dokumentáltan, logikusan nem bővíthető keret esetén lehetséges. Ez minden AI-fejlesztőre vonatkozik.

## Kötelező validációs paritás feature-migrációnál

- Minden feature átvezetésekor fel kell mérni és dokumentáltan át kell venni a referencia összes érintett validációját (modul, lokális felülírás, közös konfig, mentés). A `required`/must-set önmagában nem teljes migráció.
- Az általános validátort a VAPA adja, a konkrét formátum, határérték és üzleti kivétel a fogyasztóé. Kliens és szerver/UI/API útvonal egyaránt ellenőrzendő. Eltérés csak dokumentált döntéssel maradhat.
