<?php
declare(strict_types=1);

$language = $argv[1] ?? 'en';
if (!in_array($language, ['en', 'hu'], true)) throw new InvalidArgumentException('Unknown website language.');
$content = require __DIR__.'/content.php';
$t = $content[$language];
$escape = static fn(string $value): string => htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$rich = static fn(string $value): string => str_replace('&lt;br&gt;', '<br>', $escape($value));
$root = $language === 'hu' ? '../' : './';
$home = $root.($language === 'hu' ? 'hu/' : '');
$canonical = 'https://61ade.com/'.($language === 'hu' ? 'hu/' : '');
$demo = 'https://61ade.sanch.hu/';
$repository = 'https://github.com/sanch78/61ade';
$documentation = $repository.'/blob/main/docs/';
$sections = ['idea', 'product', 'foundations', 'story', 'usage'];
$checkout = dirname(__DIR__, 3);
require_once $checkout.'/packages/php/src/Shell/Splash.php';
$image = static function (string $file, string $alt, bool $priority = false, bool $mobile = false) use ($root, $escape, $language): void {
    if ($language === 'en') $file .= '-en'; ?>
<a class="screenshot" href="<?= $root ?>assets/<?= $escape($file) ?>.jpg" data-preview><img src="<?= $root ?>assets/<?= $escape($file) ?>.jpg" alt="<?= $escape($alt) ?>" width="<?= $mobile ? 390 : 1440 ?>" height="<?= $mobile ? 844 : 900 ?>"<?= $priority ? ' fetchpriority="high"' : ($mobile ? '' : ' loading="lazy"') ?> decoding="async"></a><?php
};
// Line icons (24 × 24, stroked with currentColor).
$icons = [
    'braces' => '<path d="M9 4H7.5A2.5 2.5 0 0 0 5 6.5V10l-2 2 2 2v3.5A2.5 2.5 0 0 0 7.5 20H9M15 4h1.5A2.5 2.5 0 0 1 19 6.5V10l2 2-2 2v3.5a2.5 2.5 0 0 1-2.5 2.5H15"/>',
    'code' => '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4.5l-3 15"/>',
    'home' => '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
    'user' => '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.6 3.9-5.5 7-5.5s5.8 1.9 7 5.5"/>',
    'shield' => '<path d="M12 3l7 3v5.2c0 4.3-2.9 8-7 9.8-4.1-1.8-7-5.5-7-9.8V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
    'table' => '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M9.5 9.5v10"/>',
    'pulse' => '<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
    'blocks' => '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><path d="M16.5 13.5v6M13.5 16.5h6"/>',
    'globe' => '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.3 3.5 5.1 3.5 8.5s-1.1 6.2-3.5 8.5c-2.4-2.3-3.5-5.1-3.5-8.5s1.1-6.2 3.5-8.5z"/>',
];
$icon = static fn(string $name): string => '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">'.$icons[$name].'</svg>';
$arrow = '<span class="arrow" aria-hidden="true">↗</span>';
$label = static fn(string $index, string $text): string => '<p class="label"><span>'.$index.'</span>'.$text.'</p>';
?>
<!doctype html>
<html lang="<?= $language ?>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= $escape($t['title']) ?></title>
    <meta name="description" content="<?= $escape($t['description']) ?>">
    <meta name="theme-color" content="#f4f3ef">
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
    <link rel="preload" href="<?= $root ?>assets/fonts/newsreader-latin.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="<?= $root ?>assets/fonts/geist-latin.woff2" as="font" type="font/woff2" crossorigin>
    <script><?= \Blade\Shell\Splash::GATE ?></script>
    <link rel="stylesheet" href="<?= $root ?>assets/site.css">
    <script type="module" src="<?= $root ?>assets/site.js"></script>
</head>
<body>
<?php require $checkout.'/packages/php/templates/splash.php'; ?>
<a class="skip-link" href="#main"><?= $escape($t['skip']) ?></a>
<header class="header">
    <div class="header-inner wrap">
        <a class="brand" href="<?= $home ?>" aria-label="61ade"><img src="<?= $root ?>assets/logo.svg" alt="61ade" width="1795" height="395"></a>
        <nav class="desktop-nav" aria-label="<?= $escape($t['menu']) ?>">
<?php foreach ($sections as $i => $section): ?>
            <a href="#<?= $section ?>"><?= $escape($t['nav'][$i]) ?></a>
<?php endforeach; ?>
        </nav>
        <div class="header-actions">
            <nav class="languages" aria-label="<?= $escape($t['language']) ?>">
                <a href="<?= $root ?>" lang="en" hreflang="en"<?= $language === 'en' ? ' aria-current="page"' : '' ?>>EN</a><a href="<?= $root ?>hu/" lang="hu" hreflang="hu"<?= $language === 'hu' ? ' aria-current="page"' : '' ?>>HU</a>
            </nav>
            <a class="button button--small" href="<?= $demo ?>" target="_blank" rel="noopener"><?= $escape($t['demoShort']) ?><?= $arrow ?></a>
            <details class="mobile-nav">
                <summary><span class="visually-hidden"><?= $escape($t['menu']) ?></span><span class="burger" aria-hidden="true"></span></summary>
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
    <section class="hero" aria-labelledby="hero-title">
        <div class="hero-copy wrap">
            <p class="badge" data-enter><span class="dot" aria-hidden="true"></span><?= $escape($t['stack']) ?></p>
            <h1 id="hero-title" data-enter><?= $escape($t['headline']) ?> <em><?= $escape($t['headlineAccent']) ?></em></h1>
            <p class="lead" data-enter><?= $escape($t['intro']) ?></p>
            <div class="buttons" data-enter>
                <a class="button" href="<?= $demo ?>" target="_blank" rel="noopener"><?= $escape($t['demo']) ?><?= $arrow ?></a>
                <a class="button button--ghost" href="<?= $repository ?>"><?= $escape($t['github']) ?><?= $arrow ?></a>
            </div>
            <p class="hero-login" data-enter><?= $escape($t['demoHint']) ?> <code>demo@example.test</code> <span aria-hidden="true">/</span> <code>61ade-demo</code></p>
        </div>
        <div class="stage">
            <div class="stage-inner wrap" data-enter>
                <div class="browser">
                    <div class="browser-bar" aria-hidden="true"><span class="browser-dots"><i></i><i></i><i></i></span><span class="browser-url">61ade.sanch.hu</span></div>
                    <?php $image('workspace', $t['workspaceAlt'], true); ?>
                </div>
                <div class="phone"><?php $image('mobile', $t['mobileAlt'], false, true); ?></div>
            </div>
            <dl class="facts wrap">
<?php foreach ($t['facts'] as [$name, $value]): ?>
                <div><dt><?= $escape($name) ?></dt><dd><?= $escape($value) ?></dd></div>
<?php endforeach; ?>
            </dl>
        </div>
    </section>

    <section class="section" id="idea" aria-labelledby="idea-title">
        <div class="wrap">
            <div class="section-head" data-reveal>
                <?= $label('01', $escape($t['ideaLabel'])) ?>
                <h2 id="idea-title"><?= $rich($t['ideaTitle']) ?></h2>
                <p><?= $escape($t['ideaText']) ?></p>
            </div>
            <div class="principles">
<?php foreach ($t['principles'] as $i => [$title, $text]): ?>
                <article data-reveal><?= $icon(['braces', 'code', 'home'][$i]) ?><h3><?= $escape($title) ?></h3><p><?= $escape($text) ?></p></article>
<?php endforeach; ?>
            </div>
        </div>
    </section>

    <section class="section section--tint" id="product" aria-labelledby="product-title">
        <div class="wrap">
            <div class="section-head" data-reveal>
                <?= $label('02', $escape($t['productLabel'])) ?>
                <h2 id="product-title"><?= $rich($t['productTitle']) ?></h2>
                <p><?= $escape($t['productText']) ?></p>
            </div>
            <div class="showcase" data-reveal>
<?php foreach ($t['features'] as $i => [$file, $title, $text, $alt, $guide]): ?>
                <article class="feature" id="feature-<?= $file ?>">
                    <div class="feature-copy">
                        <h3><span class="feature-index" aria-hidden="true">0<?= $i + 1 ?></span><span class="feature-title"><?= $escape($title) ?></span></h3>
                        <div class="feature-body"><p><?= $escape($text) ?></p><a class="text-link" href="<?= $documentation.$guide ?>"><?= $escape($t['docs']) ?><?= $arrow ?></a></div>
                        <span class="feature-progress" aria-hidden="true"></span>
                    </div>
                    <figure class="feature-figure"><div class="browser"><div class="browser-bar" aria-hidden="true"><span class="browser-dots"><i></i><i></i><i></i></span><span class="browser-url">61ade.sanch.hu</span></div><?php $image($file, $alt); ?></div></figure>
                </article>
<?php endforeach; ?>
            </div>
            <p class="note"><?= $escape($t['imageNote']) ?></p>
        </div>
    </section>

    <section class="section section--dark" id="foundations" aria-labelledby="foundations-title">
        <div class="wrap">
            <div class="section-head" data-reveal>
                <?= $label('03', $escape($t['foundationsLabel'])) ?>
                <h2 id="foundations-title"><?= $rich($t['foundationsTitle']) ?></h2>
                <p><?= $escape($t['foundationsText']) ?></p>
            </div>
            <div class="capabilities">
<?php foreach ($t['capabilities'] as $i => [$title, $text, $guide]): ?>
                <article data-reveal><?= $icon(['user', 'shield', 'table', 'pulse', 'blocks', 'globe'][$i]) ?><h3><?= $escape($title) ?></h3><p><?= $escape($text) ?></p><a class="text-link" href="<?= $documentation.$guide ?>"><?= $escape($t['docs']) ?><?= $arrow ?></a></article>
<?php endforeach; ?>
            </div>
            <p class="status"><span class="dot" aria-hidden="true"></span><?= $escape($t['status']) ?></p>
        </div>
    </section>

    <section class="section" id="story" aria-labelledby="story-title">
        <div class="wrap">
            <div class="section-head" data-reveal>
                <?= $label('04', $escape($t['storyLabel'])) ?>
                <h2 id="story-title"><?= $rich($t['storyTitle']) ?></h2>
                <p><?= $escape($t['storyLead']) ?></p>
            </div>
            <ol class="timeline">
<?php foreach ($t['chapters'] as [$name, $title, $text]): ?>
                <li data-reveal><p class="timeline-name"><?= $escape($name) ?></p><h3><?= $escape($title) ?></h3><p><?= $escape($text) ?></p></li>
<?php endforeach; ?>
            </ol>
            <p class="signature" data-reveal><?= $escape($t['signature']) ?></p>
        </div>
    </section>

    <section class="section section--tint" id="usage" aria-labelledby="usage-title">
        <div class="wrap">
            <div class="usage">
                <div data-reveal>
                    <?= $label('05', $escape($t['usageLabel'])) ?>
                    <h2 id="usage-title"><?= $rich($t['usageTitle']) ?></h2>
                    <p class="usage-lead"><?= $escape($t['usageText']) ?></p>
                    <p><?= $escape($t['usageThanks']) ?></p>
                    <div class="buttons"><a class="button" href="<?= $repository ?>"><?= $escape($t['github']) ?><?= $arrow ?></a><a class="button button--ghost" href="mailto:sanch@61ade.com">sanch@61ade.com<?= $arrow ?></a></div>
                </div>
                <aside class="license" data-reveal>
                    <p class="license-tag"><?= $escape($t['licenseTag']) ?></p>
                    <h3><?= $escape($t['licenseTitle']) ?></h3>
                    <p><?= $escape($t['licenseText']) ?></p>
                    <p class="license-links"><a class="text-link" href="https://github.com/DHTMLX/dhtmlx-suite-gpl">DHTMLX Suite<?= $arrow ?></a><a class="text-link" href="https://docs.dhtmlx.com/scheduler/">DHTMLX Scheduler<?= $arrow ?></a></p>
                    <p class="license-note"><?= $escape($t['licenseNote']) ?> <a href="<?= $repository ?>#licenses">GitHub<?= $arrow ?></a></p>
                </aside>
            </div>
            <div class="invite" data-reveal>
                <div class="invite-copy">
                    <h3><?= $escape($t['demoTitle']) ?></h3>
                    <p><?= $escape($t['demoText']) ?></p>
                </div>
                <div class="login-card">
                    <div class="login-card-bar" aria-hidden="true"><img src="<?= $root ?>assets/mark.svg" alt="" width="20" height="20"><span>61ade</span></div>
                    <dl class="credentials" data-copy="<?= $escape($t['copy']) ?>" data-copied="<?= $escape($t['copied']) ?>">
                        <div><dt><?= $escape($t['emailLabel']) ?></dt><dd><code>demo@example.test</code></dd></div>
                        <div><dt><?= $escape($t['passwordLabel']) ?></dt><dd><code>61ade-demo</code></dd></div>
                    </dl>
                    <a class="button button--block" href="<?= $demo ?>" target="_blank" rel="noopener"><?= $escape($t['demo']) ?><?= $arrow ?></a>
                </div>
            </div>
        </div>
    </section>

    <section class="closing" id="contact" aria-labelledby="contact-title">
        <div class="wrap" data-reveal>
            <p class="label label--center"><span>06</span><?= $escape($t['contactLabel']) ?></p>
            <h2 id="contact-title"><?= $escape($t['contactTitle']) ?></h2>
            <p><?= $escape($t['contactText']) ?></p>
            <a class="contact-email" href="mailto:sanch@61ade.com">sanch@61ade.com<?= $arrow ?></a>
        </div>
    </section>
</main>
<footer class="footer">
    <div class="footer-inner wrap">
        <div class="footer-brand"><a class="brand" href="<?= $home ?>" aria-label="61ade"><img src="<?= $root ?>assets/logo-dark.svg" alt="61ade" width="1795" height="395"></a><p><?= $escape($t['footer']) ?></p></div>
        <nav class="footer-links" aria-label="<?= $escape($t['footerNav']) ?>">
            <a href="<?= $demo ?>" target="_blank" rel="noopener"><?= $escape($t['demoShort']) ?></a>
            <a href="<?= $repository ?>">GitHub</a>
            <a href="<?= $documentation ?>usage.md"><?= $escape($t['docs']) ?></a>
            <a href="mailto:sanch@61ade.com">sanch@61ade.com</a>
        </nav>
        <nav class="footer-languages" aria-label="<?= $escape($t['language']) ?>"><a href="<?= $root ?>" lang="en" hreflang="en"<?= $language === 'en' ? ' aria-current="page"' : '' ?>>English</a><a href="<?= $root ?>hu/" lang="hu" hreflang="hu"<?= $language === 'hu' ? ' aria-current="page"' : '' ?>>Magyar</a></nav>
    </div>
</footer>
<dialog class="image-dialog" aria-label="<?= $escape($t['screenLink']) ?>"><button class="image-close" type="button" aria-label="<?= $escape($t['close']) ?>">×</button><figure><img alt=""><figcaption></figcaption></figure></dialog>
</body>
</html>
