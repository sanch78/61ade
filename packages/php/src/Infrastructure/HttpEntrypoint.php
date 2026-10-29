<?php
declare(strict_types=1);
namespace Blade\Infrastructure;

use Blade\Shell\Application;
use Blade\Shell\ApplicationDefinition;

final class HttpEntrypoint
{
    /** $definition is lazy, so configuration and DB failures receive the same safe error response. */
    public static function run(\Closure $definition, bool $trustLocalProxy = false): void
    {
        if ($trustLocalProxy && in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) {
            $client = $_SERVER['HTTP_X_BLADE_CLIENT_IP'] ?? '';
            if (filter_var($client, FILTER_VALIDATE_IP)) {
                $_SERVER['REMOTE_ADDR'] = $client;
                $_SERVER['HTTPS'] = ($_SERVER['HTTP_X_BLADE_HTTPS'] ?? '') === 'on' ? 'on' : 'off';
            }
        }
        try {
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
}
