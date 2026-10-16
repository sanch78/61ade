# VAPA fejlesztési szabályok

- A VAPA külön Git-repó, újrahasznosítható keretrendszer. CityScreen/ADE üzleti kód, táblanév, production adat vagy integrációs függőség nem kerülhet bele.
- A koncepció és fejlesztési terv a `docs/` alatt található. Megvalósításnál a dokumentációt ugyanabban a módosítási batchben frissítsd. A tervezett képességet ne jelöld késznek bizonyíték nélkül.
- A gyökér README az egyetlen README; részletes dokumentáció célzott `docs/*.md` fájlokban legyen.
- PHP forrás: `packages/php`; frontend: `packages/frontend`; tesztek: `tests`; segédeszközök: `tools`.
- Futási scratch, log, cache, tesztartifact, lock és runtime home a `codex/tmp/` alatt legyen. Backup a repón kívül, `$CODEX_HOME/backup/project/vapa` alatt legyen; a CODEX_HOME értékét ne módosítsd.
- Csak szintetikus fixture és demo adatot commitolj. Secretet, vendored PRO csomagot, node_modules-t vagy vendort soha.
- A szerveroldali jogosultságvizsgálat kötelező minden olvasási és írási csatornán. A kliensoldali elrejtés nem védelem.
- A feature-definíció backend-only tartalma nem kerülhet a böngészőnek átadott metaadatokba.
- Ne módosítsd a CityScreen runtime-ját, adatbázisát vagy régi adminját a VAPA fejlesztés mellékhatásaként.
- Nagyobb tervezési vagy implementációs munkánál minden érdemi módosítási batch után kötelező: `/usr/local/bin/gitpush --all -t` a VAPA repó gyökeréből. Előtte ellenőrizd a staged tartalmat.
- A CityScreen symlink nem másolat: `git -C /space/frameworks/vapa status` a keret állapota; a fogyasztó repó állapotát külön ellenőrizd.
