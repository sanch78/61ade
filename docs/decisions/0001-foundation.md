# ADR-0001 — Alapirány és nyitott döntések

Dátum: 2026-10-16.

## Elfogadott felhasználói döntések

- VAPA = Very Advanced PHP Admin; külön újrahasznosítható keretrendszerrepó: https://github.com/sanch78/vapa.
- A CityScreen teljes adminját újraírjuk, nem csak a keretet vagy néhány gridet.
- A VAPA és CityScreen üzleti logika nem élhet ugyanabban a repóban.
- Modern PHP, PHP-FPM + OPcache alapirány. Go és Node backend nem választott.
- DHTMLX komponensek: Suite, Gantt, Scheduler; a kész UI vezérlők fölött saját keret.
- Feature-definíciók fejlesztő által, verziókezelt kódban készülnek.
- Több szervezet, objektum- és mezőszintű jogosultság, feature-önként kapcsolható külső API.
- Modulonkénti átállás, minden átvett üzleti logika újraírásával; nincs ADE-kompatibilitási réteg.
- A licenckorlátok megvitatása nem akadály a tervezésben; konkrét PRO-vásárlás nem történt.
- Helyi CityScreen/vapa symlink szükséges a szerkesztéshez.

## Ebben a scaffoldban választott technikai alapértékek

- Canonical checkout: `/space/frameworks/vapa`.
- PHP és frontend csomag egy VAPA-monorepóban; PHP namespace `Vapa\\`.
- PHP minimum 8.4 a manifestben; frontend TypeScript tervezett.
- Példaalkalmazás szintetikus, alkalmazásfüggetlen domainnel.
- A jelenlegi frontendcsomag private, publikálást véletlenül sem indítunk.

## Javaslat, M1-ben véglegesítendő

Symfony 7.4 LTS hosting, mert bevált infrastruktúrát ad HTTP, DI, validáció, security és jobkezelés számára. A felhasználó modern PHP-t választott, konkrét PHP-frameworköt nem; ezt nem kezeljük korábban jóváhagyott termékválasztásként.

## Nyitott döntések, határidővel

| Döntés | Legkésőbb |
| --- | --- |
| VAPA saját licenc, GPL-es frontendcsomag terjesztési modell | M1, publikálás előtt |
| Hosting framework, DB adapter, pontos toolchain és dependency verziók | M1 |
| Metaadat és API wire schema, publikus interfészek | M1–M3 |
| Gépi auth, token-életciklus és visszavonás | M2 |
| PRO-képességek licencelt vagy alternatív megvalósítása | Érintett adapter M4/M5 megvalósítása előtt |
| Package artifact/registry és release automation | M7 |
| CityScreen végleges modulhatárok, első átadandó modul, schema-migráció | CityScreen A0/A1 |
| Mérhető teljesítménycélok | M7 előtt, baseline mérés után |

A dokumentáció szándékosan nem nevez nyitott döntést kész implementációs szerződésnek. A következő fázisok feladata ezek lezárása.

## Későbbi pontosítás — 2026-10-21

A PHP-választás a referencia-backendre vonatkozik; a frontend nyelvfüggetlen JSON-szerződésen kommunikál. A verziókezelt feature-definíciók tagolt JSON-ban is készülhetnek. Részletek: [ADR-0003](0003-product-direction.md).
