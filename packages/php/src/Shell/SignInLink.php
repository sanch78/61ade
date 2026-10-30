<?php
declare(strict_types=1);
namespace Blade\Shell;

/**
 * One link of the sign-in windows: a localizable label and a same-origin path (page-relative, `../` prefixes allowed,
 * or root-absolute) or an `https://` URL. Anything else (another scheme, `//host`, `.` or `..` inside the path,
 * spaces, quotes) is refused.
 */
final readonly class SignInLink
{
    public function __construct(
        public string $label,
        public string $href,
    ) {
        if (trim($label) === '' || mb_strlen($label) > 80 || !self::valid($href)) throw new \InvalidArgumentException('Invalid 61ade sign-in link: '.$href);
    }

    private static function valid(string $href): bool
    {
        if (preg_match('~^https://[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*(?::[0-9]{1,5})?(?:[/?#][A-Za-z0-9_.\~!$&()*+,;=:@%/?#-]*)?$~D', $href)) return true;
        $path = (string) preg_replace('~^(?:\.\./)+~', '', $href);
        if ($path !== $href && str_starts_with($path, '/')) return false;
        if ($href === '/' || $href === './' || ($path === '' && $href !== '')) return true;
        return preg_match('~^/?[A-Za-z0-9_.\~-]+(?:/[A-Za-z0-9_.\~-]+)*/?(?:\?[A-Za-z0-9_.\~=&%+-]*)?(?:#[A-Za-z0-9_.\~-]*)?$~D', $path) === 1
            && !preg_match('~(?:^|/)\.{1,2}(?:/|[?#]|$)~', $path);
    }
}
