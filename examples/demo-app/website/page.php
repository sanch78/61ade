<?php
declare(strict_types=1);

$language = $argv[1] ?? 'en';
if (!in_array($language, ['en', 'hu'], true)) throw new InvalidArgumentException('Unknown website language.');
$content = require __DIR__.'/content.php';
$t = $content[$language];
$escape = static fn(string $value): string => htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$rich = static fn(string $value): string => str_replace('&lt;br&gt;', '<br>', $escape($value));
$root = $language === 'hu' ? '../' : './';
$canonical = 'https://61ade.com/'.($language === 'hu' ? 'hu/' : '');
$repository = 'https://github.com/sanch78/61ade';
$documentation = $repository.'/blob/main/docs/';
$sections = ['introduction', 'capabilities', 'history', 'usage', 'contact'];
$checkout = dirname(__DIR__, 3);
require_once $checkout.'/packages/php/src/Shell/Splash.php';
$image = static function (string $file, string $alt, bool $priority = false, bool $mobile = false) use ($root, $escape, $language): void {
    if ($language === 'en') $file .= '-en'; ?>
    <a class="screenshot<?= $mobile ? ' screenshot--mobile' : '' ?>" href="<?= $root ?>assets/<?= $escape($file) ?>.jpg" data-preview>
        <img src="<?= $root ?>assets/<?= $escape($file) ?>.jpg" alt="<?= $escape($alt) ?>" width="<?= $mobile ? 390 : 1440 ?>" height="<?= $mobile ? 844 : 900 ?>" <?= $priority ? 'fetchpriority="high"' : 'loading="lazy"' ?> decoding="async">
    </a>
<?php };
?>
<!doctype html>
<html lang="<?= $language ?>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= $escape($t['title']) ?></title>
    <meta name="description" content="<?= $escape($t['description']) ?>">
    <meta name="theme-color" content="#080c13">
    <link rel="canonical" href="<?= $canonical ?>">
    <link rel="alternate" hreflang="en" href="https://61ade.com/">
    <link rel="alternate" hreflang="hu" href="https://61ade.com/hu/">
    <link rel="alternate" hreflang="x-default" href="https://61ade.com/">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="61ade">
    <meta property="og:title" content="<?= $escape($t['title']) ?>">
    <meta property="og:description" content="<?= $escape($t['description']) ?>">
    <meta property="og:url" content="<?= $canonical ?>">
    <meta property="og:locale" content="<?= $language === 'hu' ? 'hu_HU' : 'en_US' ?>">
    <meta property="og:locale:alternate" content="<?= $language === 'hu' ? 'en_US' : 'hu_HU' ?>">
    <meta property="og:image" content="https://61ade.com/assets/workspace<?= $language === 'en' ? '-en' : '' ?>.jpg">
    <meta property="og:image:alt" content="<?= $escape($t['workspaceAlt']) ?>">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="icon" type="image/svg+xml" href="<?= $root ?>assets/mark.svg">
    <script><?= \Blade\Shell\Splash::GATE ?></script>
    <link rel="stylesheet" href="<?= $root ?>assets/site.css">
    <script type="module" src="<?= $root ?>assets/site.js"></script>
</head>
<body>
<?php require $checkout.'/packages/php/templates/splash.php'; ?>
<a class="skip-link" href="#main"><?= $escape($t['skip']) ?></a>
<header class="header">
    <div class="header-inner wrap">
        <a class="brand" href="<?= $root ?><?= $language === 'hu' ? 'hu/' : '' ?>" aria-label="61ade"><img src="<?= $root ?>assets/logo.svg" alt="61ade" width="1795" height="395"></a>
        <nav class="desktop-nav" aria-label="<?= $escape($t['menu']) ?>">
<?php foreach ($sections as $i => $section): ?>
            <a href="#<?= $section ?>"><?= $escape($t['nav'][$i]) ?></a>
<?php endforeach; ?>
        </nav>
        <div class="header-actions">
            <nav class="languages" aria-label="<?= $escape($t['language']) ?>">
                <a href="<?= $root ?>" lang="en" hreflang="en"<?= $language === 'en' ? ' aria-current="page"' : '' ?>>EN</a><span aria-hidden="true">/</span><a href="<?= $root ?>hu/" lang="hu" hreflang="hu"<?= $language === 'hu' ? ' aria-current="page"' : '' ?>>HU</a>
            </nav>
            <details class="mobile-nav">
                <summary><?= $escape($t['menu']) ?></summary>
                <nav aria-label="<?= $escape($t['menu']) ?>">
<?php foreach ($sections as $i => $section): ?>
                    <a href="#<?= $section ?>"><?= $escape($t['nav'][$i]) ?></a>
<?php endforeach; ?>
                </nav>
            </details>
        </div>
    </div>
</header>
<main id="main">
    <section class="hero wrap" aria-labelledby="hero-title">
        <p class="eyebrow"><span class="status-dot" aria-hidden="true"></span><?= $escape($t['eyebrow']) ?></p>
        <div class="hero-heading">
            <h1 id="hero-title"><?= $escape($t['headline']) ?> <em><?= $escape($t['headlineAccent']) ?></em></h1>
            <p class="hero-aside"><?= $rich($t['aside']) ?></p>
        </div>
        <p class="hero-description"><?= $escape($t['intro']) ?></p>
        <div class="buttons">
            <a class="button button--primary" href="https://61ade.sanch.hu/" target="_blank" rel="noopener"><?= $escape($t['demo']) ?><span aria-hidden="true">↗</span></a>
            <a class="button button--secondary" href="<?= $repository ?>"><?= $escape($t['github']) ?><span aria-hidden="true">↗</span></a>
        </div>
        <div class="hero-preview">
            <div class="screen-label"><span><span class="status-dot" aria-hidden="true"></span><?= $escape($t['live']) ?></span><span>61ade / demo</span></div>
            <?php $image('workspace', $t['workspaceAlt'], true); ?>
            <div class="phone-preview"><?php $image('mobile', $t['mobileAlt'], false, true); ?></div>
        </div>
        <p class="stack"><?= $escape($t['stack']) ?></p>
    </section>

    <section class="section wrap" id="introduction" aria-labelledby="overview-title">
        <p class="eyebrow"><?= $escape($t['overviewLabel']) ?></p>
        <div class="section-heading">
            <h2 id="overview-title"><?= $rich($t['overviewTitle']) ?></h2>
            <p><?= $escape($t['overviewText']) ?></p>
        </div>
        <div class="principles">
<?php foreach ($t['principles'] as $i => [$title, $text]): ?>
            <article><span class="index" aria-hidden="true">0<?= $i + 1 ?></span><h3><?= $escape($title) ?></h3><p><?= $escape($text) ?></p></article>
<?php endforeach; ?>
        </div>
    </section>

    <section class="section wrap" id="capabilities" aria-labelledby="features-title">
        <p class="eyebrow"><?= $escape($t['featuresLabel']) ?></p>
        <div class="section-heading"><h2 id="features-title"><?= $rich($t['featuresTitle']) ?></h2><p><?= $escape($t['featuresText']) ?></p></div>
        <article class="feature feature--files">
            <div class="feature-copy"><h3><?= $escape($t['filesTitle']) ?></h3><p><?= $escape($t['filesText']) ?></p><a class="text-link" href="<?= $documentation ?>files.md"><?= $escape($t['docs']) ?> <span aria-hidden="true">↗</span></a></div>
            <div class="file-screens">
                <figure><?php $image('files', $t['filesAlt']); ?><figcaption><?= $escape($t['filesCaption']) ?></figcaption></figure>
                <figure><?php $image('media', $t['mediaAlt']); ?><figcaption><?= $escape($t['mediaCaption']) ?></figcaption></figure>
            </div>
        </article>
        <div class="feature-pair">
            <article class="feature"><h3><?= $escape($t['calendarTitle']) ?></h3><p><?= $escape($t['calendarText']) ?></p><?php $image('calendar', $t['calendarAlt']); ?><a class="text-link" href="<?= $documentation ?>calendar.md"><?= $escape($t['docs']) ?> <span aria-hidden="true">↗</span></a></article>
            <article class="feature"><h3><?= $escape($t['diagramTitle']) ?></h3><p><?= $escape($t['diagramText']) ?></p><?php $image('diagram', $t['diagramAlt']); ?><a class="text-link" href="<?= $documentation ?>diagrams.md"><?= $escape($t['docs']) ?> <span aria-hidden="true">↗</span></a></article>
        </div>
        <p class="image-note"><?= $escape($t['imageNote']) ?></p>
        <div class="capability-details">
            <h3><?= $escape($t['detailsTitle']) ?></h3>
            <div>
<?php foreach ($t['capabilities'] as [$title, $text, $guide]): ?>
                <details><summary><?= $escape($title) ?><span aria-hidden="true">+</span></summary><div class="detail-content"><p><?= $escape($text) ?></p><a class="text-link" href="<?= $documentation.$guide ?>"><?= $escape($t['docs']) ?> <span aria-hidden="true">↗</span></a></div></details>
<?php endforeach; ?>
            </div>
        </div>
        <p class="product-status"><?= $escape($t['status']) ?></p>
    </section>

    <section class="history" id="history" aria-labelledby="history-title">
        <div class="wrap section">
            <p class="eyebrow"><?= $escape($t['historyLabel']) ?></p>
            <div class="section-heading"><h2 id="history-title"><?= $rich($t['historyTitle']) ?></h2><p><?= $escape($t['historyLead']) ?></p></div>
            <div class="timeline">
<?php foreach ($t['chapters'] as [$name, $title, $text]): ?>
                <article><div class="timeline-name"><?= $escape($name) ?></div><div><h3><?= $escape($title) ?></h3><p><?= $escape($text) ?></p></div></article>
<?php endforeach; ?>
            </div>
            <p class="signature"><?= $escape($t['signature']) ?></p>
        </div>
    </section>

    <section class="section wrap" id="usage" aria-labelledby="usage-title">
        <p class="eyebrow"><?= $escape($t['usageLabel']) ?></p>
        <div class="usage-grid">
            <div><h2 id="usage-title"><?= $rich($t['usageTitle']) ?></h2><p class="usage-lead"><?= $escape($t['usageText']) ?></p><p><?= $escape($t['usageThanks']) ?></p><div class="buttons"><a class="button button--primary" href="<?= $repository ?>"><?= $escape($t['github']) ?> <span aria-hidden="true">↗</span></a><a class="text-link" href="mailto:sanch@61ade.com">sanch@61ade.com <span aria-hidden="true">↗</span></a></div></div>
            <aside class="license"><span class="license-symbol" aria-hidden="true">{ }</span><h3><?= $escape($t['licenseTitle']) ?></h3><p><?= $escape($t['licenseText']) ?></p><div class="license-links"><a class="text-link" href="https://github.com/DHTMLX/dhtmlx-suite-gpl">DHTMLX Suite ↗</a><a class="text-link" href="https://docs.dhtmlx.com/scheduler/">DHTMLX Scheduler ↗</a></div><p class="license-note"><?= $escape($t['licenseNote']) ?> <a href="<?= $repository ?>#licenses">GitHub ↗</a></p></aside>
        </div>
        <div class="demo-invite">
            <div><span class="status-dot" aria-hidden="true"></span><h3><?= $escape($t['demoTitle']) ?></h3><p><?= $escape($t['demoText']) ?></p></div>
            <dl class="credentials"><div><dt><?= $escape($t['emailLabel']) ?></dt><dd><code>demo@example.test</code></dd></div><div><dt><?= $escape($t['passwordLabel']) ?></dt><dd><code>61ade-demo</code></dd></div></dl>
            <a class="button button--secondary" href="https://61ade.sanch.hu/" target="_blank" rel="noopener"><?= $escape($t['demo']) ?> <span aria-hidden="true">↗</span></a>
        </div>
    </section>

    <section class="contact section wrap" id="contact" aria-labelledby="contact-title">
        <p class="eyebrow"><?= $escape($t['contactLabel']) ?></p>
        <h2 id="contact-title"><?= $escape($t['contactTitle']) ?></h2>
        <p><?= $escape($t['contactText']) ?></p>
        <a class="contact-email" href="mailto:sanch@61ade.com">sanch@61ade.com <span aria-hidden="true">↗</span></a>
    </section>
</main>
<footer class="footer wrap"><a class="brand" href="<?= $root ?><?= $language === 'hu' ? 'hu/' : '' ?>"><img src="<?= $root ?>assets/logo.svg" alt="61ade" width="1795" height="395"></a><p><?= $escape($t['footer']) ?></p><a href="<?= $repository ?>">GitHub ↗</a></footer>
<dialog class="image-dialog" aria-label="<?= $escape($t['screenLink']) ?>"><button class="image-close" type="button" aria-label="<?= $escape($t['close']) ?>">×</button><figure><img alt=""><figcaption></figcaption></figure></dialog>
</body>
</html>
