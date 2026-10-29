<!doctype html>
<html lang="<?= $escape(\Blade\I18n\Translator::locale()) ?>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= $escape(\Blade\I18n\Translator::text($definition->title)) ?></title>
    <link rel="stylesheet" href="<?= $escape($definition->assets) ?>/admin.css?v=32">
<?php foreach ($skins as $skin): ?>
    <link rel="stylesheet" href="<?= $escape($skin->stylesheet) ?>">
<?php endforeach; ?>
<?php if ($bootstrap['oauth'] ?? false): $auth = rtrim($definition->oauth->assets, '/'); ?>
    <link rel="stylesheet" href="<?= $escape($auth) ?>/AuthHandler.css">
    <script src="<?= $escape($auth) ?>/AuthHandler.js"></script>
    <script src="./?blade_auth=bootstrap"></script>
<?php endif; ?>
    <script type="module" src="<?= $escape($definition->assets) ?>/admin.js?v=32"></script>
</head>
<body>
    <div id="blade-application"></div>
    <form id="blade-command" method="post" action="./" hidden>
        <input type="hidden" name="csrf" value="<?= $escape($csrf) ?>">
    </form>
    <noscript>Az adminisztrációs felület használatához JavaScript szükséges.</noscript>
    <script type="application/json" id="blade-config"><?= json_encode($bootstrap, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) ?></script>
</body>
</html>
