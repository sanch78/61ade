<!doctype html>
<html lang="<?= $escape(\Blade\I18n\Translator::locale()) ?>" data-blade-page="<?= $escape($page) ?>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= $escape(\Blade\I18n\Translator::text($definition->title)) ?></title>
    <script><?= \Blade\Shell\Splash::GATE ?></script>
    <link rel="stylesheet" href="<?= $escape($keys->url($definition->assets.'/admin.css', 'admin.css')) ?>">
<?php foreach ($skins as $skin): ?>
    <link rel="stylesheet" href="<?= $escape($keys->url($skin->stylesheet)) ?>">
<?php endforeach; ?>
<?php foreach ($bootstrap['authenticated'] ? $definition->stylesheets : $definition->signInStylesheets as $stylesheet): ?>
    <link rel="stylesheet" href="<?= $escape($keys->url($stylesheet)) ?>">
<?php endforeach; ?>
<?php if ($bootstrap['oauth'] ?? false): $auth = rtrim($definition->oauth->assets, '/'); ?>
    <link rel="stylesheet" href="<?= $escape($keys->url($auth.'/AuthHandler.css')) ?>">
    <script src="<?= $escape($keys->url($auth.'/AuthHandler.js')) ?>"></script>
    <script src="./?blade_auth=bootstrap"></script>
<?php endif; ?>
    <script type="module" src="<?= $escape($keys->url($definition->assets.'/admin.js', 'admin.js')) ?>"></script>
</head>
<body>
    <?php /* The 61ade trademark loading screen (docs/brand.md#splash): once per browser window or tab (the head
        gate hides it on later pages), not configurable; the frontend fades it into the application. */ ?>
    <div id="blade-splash" class="blade-splash" aria-hidden="true">
        <div class="blade-splash__brand">
            <div class="blade-splash__logo"><?= file_get_contents(dirname(__DIR__).'/resources/brand/splash-logo.svg') ?><span class="blade-splash__spark"></span></div>
            <p class="blade-splash__credit">made with <b>61ade</b> framework</p>
        </div>
    </div>
    <noscript><style>.blade-splash { display: none; }</style></noscript>
    <div id="blade-application"></div>
    <form id="blade-command" method="post" action="./" hidden>
        <input type="hidden" name="csrf" value="<?= $escape($csrf) ?>">
    </form>
    <noscript>Az adminisztrációs felület használatához JavaScript szükséges.</noscript>
    <script type="application/json" id="blade-config"><?= json_encode($bootstrap, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) ?></script>
</body>
</html>
