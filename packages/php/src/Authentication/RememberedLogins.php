<?php

declare(strict_types=1);

namespace Blade\Authentication;

use PDO;
use Blade\Feature\Workspace;
use Blade\Shell\IdentityProvider;

/** Opaque random credentials; only hashes are stored, with an absolute expiry. */
final readonly class RememberedLogins
{
    public function __construct(private PDO $db)
    {
    }

    public function issue(string $actor, int $version, int $days): array
    {
        $selector = bin2hex(random_bytes(16));
        $secret = bin2hex(random_bytes(32));
        $expires = time() + $days * 86400;
        $query = $this->db->prepare(
            'INSERT INTO blade_remembered_logins(selector, actor_id, secret_hash, credential_version, expires_at) VALUES (?, ?, ?, ?, ?)',
        );
        $query->execute([$selector, $actor, hash('sha256', $secret), $version, $expires]);
        return ['cookie' => $selector.'.'.$secret, 'expires' => $expires];
    }

    public function restore(#[\SensitiveParameter] string $cookie, IdentityProvider $identities, Workspace $workspace): ?array
    {
        if (!preg_match('/^([a-f0-9]{32})\.([a-f0-9]{64})$/D', $cookie, $parts)) {
            return null;
        }
        $this->db->beginTransaction();
        try {
            $query = $this->db->prepare('SELECT * FROM blade_remembered_logins WHERE selector = ?'
                .($this->db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : ''));
            $query->execute([$parts[1]]);
            $row = $query->fetch(PDO::FETCH_ASSOC);
            if (!$row || (int) $row['expires_at'] <= time()
                || !hash_equals($row['secret_hash'], hash('sha256', $parts[2]))
                || (int) $row['credential_version'] !== $workspace->version($row['actor_id'])
                || !($actor = $identities->find($row['actor_id']))) {
                $this->delete($parts[1]);
                $this->db->commit();
                return null;
            }
            $secret = bin2hex(random_bytes(32));
            $query = $this->db->prepare('UPDATE blade_remembered_logins SET secret_hash = ? WHERE selector = ?');
            $query->execute([hash('sha256', $secret), $parts[1]]);
            $workspace->journal->record($actor->id, 'ui', 'session', 'remember_restore', '', 'success');
            $this->db->commit();
            return [
                'identity' => $actor,
                'credentialVersion' => (int) $row['credential_version'],
                'cookie' => $parts[1].'.'.$secret,
                'expires' => (int) $row['expires_at'],
            ];
        } catch (\Throwable $error) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $error;
        }
    }

    public function revoke(#[\SensitiveParameter] string $cookie): void
    {
        if (preg_match('/^([a-f0-9]{32})\.[a-f0-9]{64}$/D', $cookie, $parts)) {
            $this->delete($parts[1]);
        }
    }

    private function delete(string $selector): void
    {
        $query = $this->db->prepare('DELETE FROM blade_remembered_logins WHERE selector = ?');
        $query->execute([$selector]);
    }
}
