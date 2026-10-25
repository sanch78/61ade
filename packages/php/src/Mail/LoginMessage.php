<?php

declare(strict_types=1);

namespace Blade\Mail;

use Closure;
use InvalidArgumentException;
use Blade\Shell\Identity;

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

    public function __construct(private string $application, private array $texts = [], private ?Closure $overrides = null, private Layout $layout = new Layout())
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
        $replacements = ['{application}' => \Blade\I18n\Translator::text($this->application), '{name}' => $actor->displayName, '{minutes}' => (string) (int) ceil($lifetime / 60)];
        $texts = array_map(static fn($value) => strtr(\Blade\I18n\Translator::text($value), $replacements), $texts);
        if (preg_match('/[\r\n]/', $texts['subject'])) {
            throw new InvalidArgumentException('Mail subject cannot contain line breaks.');
        }
        $mail = $this->layout->render(
            \Blade\I18n\Translator::text($this->application), $texts['heading'], $texts['greeting'], [$texts['intro']],
            ['label' => $texts['code_label'], 'value' => $code], $texts['expiry'], $texts['footer'], $texts['heading'],
        );
        return ['subject' => $texts['subject'], 'html' => $mail['html'], 'text' => $mail['text']];
    }
}
