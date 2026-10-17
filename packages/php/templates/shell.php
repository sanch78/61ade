<!doctype html>
<html lang="hu">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= $escape($definition->title) ?></title>
    <link rel="stylesheet" href="assets/admin.css?v=12">
    <script type="module" src="assets/admin.js?v=12"></script>
</head>
<body>
    <div id="vapa-application"></div>
    <form id="vapa-command" method="post" action="./" hidden>
        <input type="hidden" name="csrf" value="<?= $escape($csrf) ?>">
    </form>
    <noscript>Az adminisztrációs felület használatához JavaScript szükséges.</noscript>
    <script type="application/json" id="vapa-config"><?= json_encode($bootstrap, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) ?></script>
</body>
</html>
