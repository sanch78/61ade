<!doctype html>
<html lang="hu">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= $escape($config['title']) ?></title>
    <link rel="stylesheet" href="assets/admin.css">
    <script type="module" src="assets/admin.js"></script>
</head>
<body class="<?= $identity ? 'shell-page' : 'login-page' ?>">
<?php if (!$identity): ?>
<main class="login-layout">
    <section class="login-story" aria-label="Bemutatkozás">
        <a class="brand" href="./"><span class="brand-mark" aria-hidden="true"><?= $escape(substr($config['brand'], 0, 1)) ?><span></span></span><?= $escape($config['brand']) ?><small>ADMIN</small></a>
        <div class="story-copy"><p class="eyebrow">EGY HELYEN, ÁTLÁTHATÓAN</p><h1><?= $escape($config['headline']) ?></h1><p><?= $escape($config['description']) ?></p></div>
        <div class="screen-art" aria-hidden="true"><div class="art-screen art-back"><span></span><i></i><i></i></div><div class="art-screen art-front"><span></span><b></b><i></i><i></i></div><div class="art-dot"></div></div>
        <p class="story-footer">Új adminisztrációs felület <span>VAPA / v2</span></p>
    </section>
    <section class="login-panel"><div class="login-card">
        <span class="version-label">FEJLESZTÉS ALATT · V2</span>
        <h2>Bejelentkezés</h2><p class="muted"><?= $escape($config['loginHint']) ?></p>
        <?php if ($error): ?><p class="error-message" role="alert"><?= $escape($error) ?></p><?php endif ?>
        <form method="post" action="./" class="login-form">
            <input type="hidden" name="csrf" value="<?= $escape($csrf) ?>"><input type="hidden" name="action" value="login">
            <label for="username">Felhasználónév</label><input id="username" name="username" autocomplete="username" maxlength="64" value="<?= $escape($username) ?>" required autofocus>
            <label for="password">Jelszó</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="1024" required>
            <button class="primary-button" type="submit">Bejelentkezés <span aria-hidden="true">→</span></button>
        </form>
        <p class="login-note">A belépést követően az új admin menüjének előnézete érhető el.</p>
    </div><p class="panel-footer"><?= $escape($config['brand']) ?> <span>Very Advanced PHP Admin</span></p></section>
</main>
<?php else: ?>
<a class="skip-link" href="#workspace">Ugrás a tartalomhoz</a>
<header class="shell-header"><a class="brand" href="./"><span class="brand-mark" aria-hidden="true"><?= $escape(substr($config['brand'], 0, 1)) ?><span></span></span><?= $escape($config['brand']) ?><small>ADMIN</small></a><span class="version-label">V2 · ELŐNÉZET</span><div class="account"><span><?= $escape($identity->displayName) ?></span><form method="post" action="./"><input type="hidden" name="csrf" value="<?= $escape($csrf) ?>"><input type="hidden" name="action" value="logout"><button class="logout-button" type="submit">Kijelentkezés ↗</button></form></div></header>
<?php if ($error): ?><p class="error-message" role="alert"><?= $escape($error) ?></p><?php endif ?>
<div class="shell-layout">
    <aside class="sidebar"><p class="eyebrow">MUNKATERÜLET</p><nav id="navigation" aria-label="Főmenü"></nav><p class="sidebar-footer">VAPA keretrendszer<br><span><?= $escape($config['brand']) ?> admin · v2</span></p></aside>
    <main id="workspace" tabindex="-1"><div class="breadcrumb"><?= $escape($config['brand']) ?> <span>/</span> <span id="breadcrumb-label">Áttekintés</span></div><div id="workspace-content"></div><noscript>A menü megjelenítéséhez JavaScript szükséges.</noscript></main>
</div>
<script type="application/json" id="shell-data"><?= json_encode(['menu' => $menu], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) ?></script>
<?php endif ?>
</body>
</html>
