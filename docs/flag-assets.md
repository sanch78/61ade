# Átvett zászlóikonok

A magyar, brit és német 16×11 px PNG a meglévő ADE-készletből származik:
`images/iconset/flags/{hu,gb,de}.png`, ADE source revision
`8f8158058a8f395b0fee5788abb4c80457837563`.
A felhasználó 2026-10-17-i kérése szerinti, bájtazonos átvétel; nincs átrajzolás.
A VAPA saját példányai: `packages/frontend/src/flags/`.

| Fájl | SHA-256 |
| --- | --- |
| hu.png | `61a2cecf8326a8da732499312a098f89d050d13546f6204e6204de38c550437e` |
| gb.png | `5d72c5a8bef80fca6f99f476e15ec95ce2d5e5f65c6dab9ee8e56348be0d39fc` |
| de.png | `3323814006fe6739493d27057954941830b59eff37ebaac994310e17c522dd57` |

A VAPA natív DHTMLX Toolbar `icon` CSS-osztálya használja a képeket.
A `flags.css` fájlt az admin belépő importálja; az esbuild `.png: dataurl`
loader a CSS-be csomagolja a PNG-t. A meglévő assetpublikáló továbbra is
az `admin.js` és `admin.css` fájlt adja át. A fogyasztó nem függ az ADE
könyvtár elérhetőségétől, külső CDN-től vagy zászlóemoji támogatástól.
A név szöveg marad, a kép dekoratív. A belépési belépési ablak Layoutja a főválasztóval
azonos natív Toolbart kap; így a lenyíló opciók is képesek.

A konfigurációs `i18n.flags` nyelvkód → országkód térkép, jelenleg
`hu`, `gb`, `de` képekkel. Bővítés a keretben történik: megfelelő PNG,
CSS-osztály, `languageIcon` és `Settings` támogatás, majd build/publikálás.
A GIF-készlet és a többi ADE-ikon átvétele nem része ennek a módosításnak.

Ellenőrzés: eredeti/cél SHA-256-egyezés; védett i18n böngészőpróba a
kiszámított CSS-háttérben `data:image/png` forrást és ténylegesen dekódolt
16×11 px képet vár, továbbá a nyelvváltási útvonalakat ellenőrzi.
