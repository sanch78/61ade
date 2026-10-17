<?php

declare(strict_types=1);

namespace Vapa\Mail;

use Closure;
use InvalidArgumentException;
use Vapa\Shell\Identity;

/** Formatted framework email; consumers override text, never the delivery/authentication flow. */
final readonly class LoginMessage
{
    private const DEFAULTS = [
        'subject' => '{application} – belépés megerősítése',
        'heading' => 'Belépés megerősítése',
        'greeting' => 'Kedves {name}!',
        'intro' => 'A bejelentkezés folytatásához írd be az alábbi egyszer használatos kódot a belépési ablakban.',
        'code_label' => 'Megerősítő kód',
        'expiry' => 'A kód {minutes} percig érvényes.',
        'footer' => 'Ha nem te kezdeményezted a belépést, ne add meg és ne továbbítsd a kódot.',
    ];

    public function __construct(private string $application, private array $texts = [], private ?Closure $overrides = null)
    {
        self::validate($texts);
    }

    private static function validate(array $texts): void
    {
        foreach ($texts as $key => $value) {
            if (!array_key_exists($key, self::DEFAULTS) || !is_string($value) || strlen($value) > 4000) {
                throw new InvalidArgumentException('Invalid login email text override: '.$key);
            }
        }
    }

    public function render(Identity $actor, #[\SensitiveParameter] string $code, int $lifetime): array
    {
        $overrides = $this->overrides ? ($this->overrides)($actor) : [];
        self::validate($overrides);
        $texts = array_replace(self::DEFAULTS, $this->texts, $overrides);
        $replacements = ['{application}' => \Vapa\I18n\Translator::text($this->application), '{name}' => $actor->displayName, '{minutes}' => (string) (int) ceil($lifetime / 60)];
        $texts = array_map(static fn($value) => strtr(\Vapa\I18n\Translator::text($value), $replacements), $texts);
        if (preg_match('/[\r\n]/', $texts['subject'])) {
            throw new InvalidArgumentException('Mail subject cannot contain line breaks.');
        }
        $escape = static fn(string $value): string => htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $html = '<!doctype html><html lang="'.\Vapa\I18n\Translator::locale().'"><meta charset="utf-8"><body style="margin:0;background:#f3f5f8;font-family:Arial,sans-serif;color:#203047">'
            .'<table role="presentation" style="width:100%;padding:32px 12px"><tr><td align="center">'
            .'<table role="presentation" style="width:100%;max-width:560px;background:#fff;border-radius:12px;padding:32px"><tr><td>'
            .'<p style="color:#52657a">'.$escape(\Vapa\I18n\Translator::text($this->application)).'</p>'
            .'<h1 style="font-size:24px">'.$escape($texts['heading']).'</h1>'
            .'<p>'.$escape($texts['greeting']).'</p><p style="line-height:1.6">'.nl2br($escape($texts['intro'])).'</p>'
            .'<p>'.$escape($texts['code_label']).'</p><p style="font-size:32px;letter-spacing:8px;font-weight:bold;background:#edf2fb;padding:20px;text-align:center">'.$escape($code).'</p>'
            .'<p>'.$escape($texts['expiry']).'</p><hr style="border:0;border-top:1px solid #e3e8ef">'
            .'<p style="font-size:13px;color:#52657a;line-height:1.5">'.nl2br($escape($texts['footer'])).'</p>'
            .'</td></tr></table></td></tr></table></body></html>';
        $text = implode("\n\n", [\Vapa\I18n\Translator::text($this->application), $texts['heading'], $texts['greeting'], $texts['intro'], $texts['code_label'].': '.$code, $texts['expiry'], $texts['footer']]);
        return ['subject' => $texts['subject'], 'html' => $html, 'text' => $text];
    }
}
