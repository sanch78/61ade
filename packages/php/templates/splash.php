<?php /* Shared trademark screen for the shell and the product website (docs/brand.md#splash). */ ?>
<div id="blade-splash" class="blade-splash" aria-hidden="true">
    <div class="blade-splash__brand">
        <div class="blade-splash__logo"><?= file_get_contents(dirname(__DIR__).'/resources/brand/splash-logo.svg') ?><span class="blade-splash__spark"></span></div>
        <p class="blade-splash__credit">made with <b>61ade</b> framework</p>
    </div>
</div>
<noscript><style>.blade-splash { display: none; }</style></noscript>
