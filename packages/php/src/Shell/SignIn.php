<?php
declare(strict_types=1);
namespace Blade\Shell;

/**
 * Declarative content of the sign-in, e-mail confirmation and password-change windows (docs/shell.md#sign-in-content):
 * a short plain-text notice and links (imprint, privacy, help) below the form, plus an optional first-step close
 * destination. Texts are catalogue keys translated on the server. Authentication and form handling are unchanged.
 */
final readonly class SignIn
{
    public const MAX_LINKS = 6;

    /** @param list<SignInLink> $links */
    public function __construct(
        /** Localizable plain-text notice under the form, at most 500 characters. */
        public ?string $notice = null,
        public array $links = [],
        /** Optional destination of the first-step sign-in header close button; null preserves existing behaviour. */
        public ?string $closeHref = null,
    ) {
        if ($closeHref !== null) new SignInLink('Bezárás', $closeHref);
        if ($notice !== null && (trim($notice) === '' || mb_strlen($notice) > 500)) throw new \InvalidArgumentException('Invalid 61ade sign-in notice.');
        if (!array_is_list($links) || count($links) > self::MAX_LINKS) throw new \InvalidArgumentException('Invalid 61ade sign-in links.');
        foreach ($links as $link) if (!$link instanceof SignInLink) throw new \InvalidArgumentException('Invalid 61ade sign-in links.');
    }
}
