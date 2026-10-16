# ADR-0001 — Alapirány és nyitott döntések

Dátum: 2026-10-16.

## Elfogadott felhasználói döntések

## Ebben a scaffoldban választott technikai alapértékek

- Canonical checkout: `/space/frameworks/vapa`.
- PHP és frontend csomag egy VAPA-monorepóban; PHP namespace `Vapa\\`.
- PHP minimum 8.4 a manifestben; frontend TypeScript tervezett.
- Példaalkalmazás szintetikus, alkalmazásfüggetlen domainnel.
- A jelenlegi frontendcsomag private, publikálást véletlenül sem indítunk.

## Javaslat, M1-ben véglegesítendő

Symfony 7.4 LTS hosting, mert bevált infrastruktúrát ad HTTP, DI, validáció, security és jobkezelés számára. A felhasználó modern PHP-t választott, konkrét PHP-frameworköt nem; ezt nem kezeljük korábban jóváhagyott termékválasztásként.

## Nyitott döntések, határidővel

A dokumentáció szándékosan nem nevez nyitott döntést kész implementációs szerződésnek. A következő fázisok feladata ezek lezárása.
