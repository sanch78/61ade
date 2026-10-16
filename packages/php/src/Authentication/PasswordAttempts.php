<?php

declare(strict_types=1);

namespace Vapa\Authentication;

use Vapa\Feature\Failure;
use Vapa\Shell\Identity;
use Vapa\Shell\IdentityProvider;

/** Shared IP limit survives session resets; no credentials are written to disk. */
final class PasswordAttempts
{
    public static function authenticate(string $runtime, string $address, IdentityProvider $identities, string $username, #[\SensitiveParameter] string $password): ?Identity
    {
        $lock = fopen($runtime.'/login/'.hash('sha256', $address).'.json', 'c+');
        if (!$lock || !flock($lock, LOCK_EX)) {
            throw new \RuntimeException('Login throttle unavailable.');
        }
        try {
            $attempts = json_decode(stream_get_contents($lock), true) ?: [];
            $attempts = array_values(array_filter($attempts, static fn($at) => $at > time() - 60));
            if (count($attempts) >= 5) {
                throw new Failure('Túl sok sikertelen próbálkozás. Egy perc múlva próbáld újra.', 429);
            }
            $actor = $username !== '' && strlen($username) <= 64 && $password !== '' && strlen($password) <= 1024
                ? $identities->authenticate($username, $password)
                : null;
            if (!$actor) $attempts[] = time();
            rewind($lock);
            ftruncate($lock, 0);
            fwrite($lock, json_encode($actor ? [] : $attempts, JSON_THROW_ON_ERROR));
            return $actor;
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }
}
