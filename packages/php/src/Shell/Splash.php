<?php
declare(strict_types=1);
namespace Blade\Shell;

/**
 * The trademark screen's once-per-window gate (docs/brand.md#splash): an inline head script, allowed by its CSP hash,
 * that marks `<html data-blade-splash="seen">` before the first paint when this tab's session storage has already
 * played the screen, and records the first play otherwise. A new window or tab plays it once again.
 */
final class Splash
{
    public const GATE = 'try{if(sessionStorage.getItem("blade-splash"))document.documentElement.dataset.bladeSplash="seen";else sessionStorage.setItem("blade-splash","1")}catch(e){}';

    /** CSP source of the gate script. */
    public static function source(): string
    {
        return "'sha256-".base64_encode(hash('sha256', self::GATE, true))."'";
    }
}
