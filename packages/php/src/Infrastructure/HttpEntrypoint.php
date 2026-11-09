<?php
declare(strict_types=1);
namespace Blade\Infrastructure;

use Blade\Shell\Application;
use Blade\Shell\ApplicationDefinition;

final class HttpEntrypoint
{
    /**
     * $definition is lazy, so configuration and DB failures receive the same safe error response.
     * $trustProxy names the proxies whose `X-BLADE-Client-IP`/`X-BLADE-HTTPS` replace the connection facts
     * (docs/shell.md#trusted-proxies): false none, true loopback, or a list of CIDR networks. An invalid list fails
     * closed with that error response. $trustLocalProxy is the former name of `true`.
     */
    public static function run(\Closure $definition, bool|array $trustProxy = false, bool $trustLocalProxy = false): void
    {
        try {
            if ($trustLocalProxy) $trustProxy = $trustProxy === false ? true : throw new \InvalidArgumentException('Use trustProxy or trustLocalProxy, not both.');
            if (self::trusted($_SERVER['REMOTE_ADDR'] ?? '', $trustProxy)) {
                $client = $_SERVER['HTTP_X_BLADE_CLIENT_IP'] ?? '';
                if (filter_var($client, FILTER_VALIDATE_IP)) {
                    $_SERVER['REMOTE_ADDR'] = $client;
                    $_SERVER['HTTPS'] = ($_SERVER['HTTP_X_BLADE_HTTPS'] ?? '') === 'on' ? 'on' : 'off';
                }
            }
            $app = $definition();
            if (!$app instanceof ApplicationDefinition) throw new \InvalidArgumentException('An ApplicationDefinition is required.');
            (new Application($app))->run();
        } catch (\Throwable $error) {
            error_log('61ade unavailable: '.get_class($error));
            http_response_code(503);
            header('Content-Type: text/html; charset=utf-8');
            header('Cache-Control: no-store');
            echo '<!doctype html><html lang="'.\Blade\I18n\Translator::locale().'"><meta charset="utf-8"><title>61ade</title><p role="alert">'.htmlspecialchars(\Blade\I18n\Translator::text('Az alkalmazás átmenetileg nem érhető el. Kérjük, próbáld újra később.'), ENT_QUOTES, 'UTF-8').'</p></html>';
        }
    }

    /** Every network is validated before the address is compared, so one bad entry rejects the whole list. */
    private static function trusted(mixed $address, bool|array $trustProxy): bool
    {
        if (!is_array($trustProxy)) return $trustProxy && in_array($address, ['127.0.0.1', '::1'], true);
        if (!array_is_list($trustProxy)) throw new \InvalidArgumentException('Trusted proxies must be a list of CIDR networks.');
        $networks = [];
        foreach ($trustProxy as $cidr) {
            // `address/prefix`: no zone, no prefix or IPv4 leading zeros, host bits zero, never /0 (that trusts every client).
            if (!is_string($cidr) || !preg_match('~^([0-9A-Fa-f.:]+)/([1-9][0-9]{0,2})$~D', $cidr, $match)
                || !filter_var($match[1], FILTER_VALIDATE_IP) || ($network = inet_pton($match[1])) === false
                || (int) $match[2] > strlen($network) * 8 || self::prefix($network, (int) $match[2]) !== $network) {
                throw new \InvalidArgumentException('Invalid trusted proxy network.');
            }
            $networks[] = [$network, (int) $match[2]];
        }
        $packed = is_string($address) && filter_var($address, FILTER_VALIDATE_IP) ? inet_pton($address) : false;
        if ($packed === false) return false;
        foreach ($networks as [$network, $bits]) {
            if (strlen($packed) === strlen($network) && self::prefix($packed, $bits) === $network) return true;
        }
        return false;
    }

    /** $packed with every bit after the first $bits cleared. */
    private static function prefix(string $packed, int $bits): string
    {
        $bytes = intdiv($bits, 8);
        $head = substr($packed, 0, $bytes);
        if ($bits % 8) $head .= chr(ord($packed[$bytes]) & (0xFF << (8 - $bits % 8)) & 0xFF);
        return str_pad($head, strlen($packed), "\0");
    }
}
