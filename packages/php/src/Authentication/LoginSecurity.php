<?php

declare(strict_types=1);

namespace Blade\Authentication;

use PDO;
use Blade\Feature\Failure;
use Blade\Feature\Workspace;
use Blade\Mail\Delivery;
use Blade\Mail\LoginMessage;
use Blade\Shell\Identity;
use Blade\Shell\IdentityProvider;

final readonly class LoginSecurity
{
    public Settings $settings;
    public RememberedLogins $remembered;

    public function __construct(
        private Workspace $workspace,
        private IdentityProvider $identities,
        private Delivery $delivery,
        private LoginMessage $message,
        private string $runtime,
        private string $emailAttribute,
        public int $rememberDays = 90,
        public int $codeLifetime = 600,
        private bool $defaultEmailConfirmation = true,
    ) {
        if ($rememberDays < 1 || $rememberDays > 365 || $codeLifetime < 60 || $codeLifetime > 1800) {
            throw new \InvalidArgumentException('Invalid login security configuration.');
        }
        $this->settings = new Settings($workspace->db, $defaultEmailConfirmation);
        $this->remembered = new RememberedLogins($workspace->db);
    }

    public function needsConfirmation(Identity $actor): bool
    {
        return (bool) $this->settings->get($actor->id)['email_confirmation'];
    }

    /** Password proof has already succeeded. Nothing here creates an authenticated session. */
    public function begin(Identity $actor, bool $remember, string $binding, bool $resend = false): array
    {
        $email = $actor->attributes[$this->emailAttribute] ?? '';
        if (!is_string($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->workspace->journal->record($actor->id, 'ui', 'authentication', 'email_send', '', 'rejected');
            throw new Failure('A fiókhoz érvényes e-mail-cím szükséges. Kérd az adminisztrátortól az adat javítását.', 403);
        }
        $id = bin2hex(random_bytes(32));
        $code = (string) random_int(100000, 999999);
        $now = time();
        $expires = $now + $this->codeLifetime;
        $db = $this->workspace->db;
        $db->beginTransaction();
        try {
            $this->lockActor($actor->id);
            $query = $db->prepare('SELECT COUNT(*) AS sends, COALESCE(SUM(attempts), 0) AS failures, MAX(created_at) AS last_sent FROM blade_login_challenges WHERE actor_id = ? AND created_at > ?');
            $query->execute([$actor->id, $now - 600]);
            $limits = $query->fetch(PDO::FETCH_ASSOC);
            if ((int) $limits['sends'] >= 5 || (int) $limits['failures'] >= 5
                || ($resend && (int) $limits['last_sent'] > $now - 60)) {
                throw new Failure('Túl sok próbálkozás. Új kódot legkorábban egy perc múlva kérhetsz; az összesített korlát tíz perc.', 429);
            }
            $query = $db->prepare('UPDATE blade_login_challenges SET consumed = 1 WHERE actor_id = ? AND binding_hash = ?');
            $query->execute([$actor->id, hash('sha256', $binding)]);
            $query = $db->prepare(
                'INSERT INTO blade_login_challenges(id, actor_id, code_hash, binding_hash, email_hash, credential_version, remember_login, created_at, expires_at, attempts, consumed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)',
            );
            $query->execute([
                $id, $actor->id, hash_hmac('sha256', $id.'.'.$code, $this->key()), hash('sha256', $binding),
                hash('sha256', $email), $this->workspace->version($actor->id), (int) $remember, $now, $expires,
            ]);
            $db->commit();
        } catch (\Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            $this->workspace->journal->record($actor->id, 'ui', 'authentication', 'email_send', '', $error instanceof Failure ? 'rejected' : 'error');
            throw $error;
        }
        try {
            $body = $this->message->render($actor, $code, $this->codeLifetime);
            $this->delivery->send($email, $body['subject'], $body['html'], $body['text']);
        } catch (\Throwable) {
            $this->cancel($id, $binding);
            $this->workspace->journal->record($actor->id, 'ui', 'authentication', 'email_send', '', 'error');
            throw new Failure('A megerősítő levél most nem küldhető el. Próbáld újra később.', 503);
        }
        $this->workspace->journal->record($actor->id, 'ui', 'authentication', 'email_send', '', 'success');
        [$local, $domain] = explode('@', $email, 2);
        return ['id' => $id, 'actor_id' => $actor->id, 'remember' => $remember, 'email' => substr($local, 0, 1).'***@'.$domain, 'expires' => $expires];
    }

    public function confirm(string $id, #[\SensitiveParameter] string $code, string $binding): array
    {
        $db = $this->workspace->db;
        $lookup = $db->prepare('SELECT actor_id FROM blade_login_challenges WHERE id = ?');
        $lookup->execute([$id]);
        $actorId = $lookup->fetchColumn();
        if ($actorId === false) {
            $this->workspace->journal->record('', 'ui', 'authentication', 'email_verify', '', 'rejected');
            throw new Failure('Hibás vagy lejárt megerősítő kód.', 401);
        }
        $db->beginTransaction();
        $recorded = false;
        try {
            $this->lockActor((string) $actorId);
            $query = $db->prepare('SELECT * FROM blade_login_challenges WHERE id = ?');
            $query->execute([$id]);
            $row = $query->fetch(PDO::FETCH_ASSOC);
            $query = $db->prepare('SELECT COALESCE(SUM(attempts), 0) FROM blade_login_challenges WHERE actor_id = ? AND created_at > ?');
            $query->execute([$actorId, time() - 600]);
            $failures = (int) $query->fetchColumn();
            if (!$row || $row['consumed'] || (int) $row['expires_at'] <= time() || $failures >= 5
                || !hash_equals($row['binding_hash'], hash('sha256', $binding))
                || (int) $row['credential_version'] !== $this->workspace->version((string) $actorId)
                || !($actor = $this->identities->find((string) $actorId))
                || !hash_equals($row['email_hash'], hash('sha256', (string) ($actor->attributes[$this->emailAttribute] ?? '')))) {
                throw new Failure('Hibás vagy lejárt megerősítő kód.', $failures >= 5 ? 429 : 401);
            }
            if (!preg_match('/^[0-9]{6}$/D', $code)
                || !hash_equals($row['code_hash'], hash_hmac('sha256', $id.'.'.$code, $this->key()))) {
                $query = $db->prepare('UPDATE blade_login_challenges SET attempts = attempts + 1 WHERE id = ?');
                $query->execute([$id]);
                $this->workspace->journal->record($actor->id, 'ui', 'authentication', 'email_verify', '', 'rejected');
                $recorded = true;
                $db->commit();
                throw new Failure('Hibás vagy lejárt megerősítő kód.', 401);
            }
            $query = $db->prepare('UPDATE blade_login_challenges SET consumed = 1 WHERE id = ?');
            $query->execute([$id]);
            $this->workspace->journal->record($actor->id, 'ui', 'authentication', 'email_verify', '', 'success');
            $db->commit();
            return [
                'identity' => $actor,
                'remember' => (bool) $row['remember_login'],
                'credentialVersion' => (int) $row['credential_version'],
            ];
        } catch (\Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            if (!$recorded) $this->workspace->journal->record((string) $actorId, 'ui', 'authentication', 'email_verify', '', $error instanceof Failure ? 'rejected' : 'error');
            throw $error;
        }
    }

    public function cancel(string $id, string $binding): void
    {
        $query = $this->workspace->db->prepare('UPDATE blade_login_challenges SET consumed = 1 WHERE id = ? AND binding_hash = ?');
        $query->execute([$id, hash('sha256', $binding)]);
    }

    private function lockActor(string $actor): void
    {
        $sql = 'INSERT INTO blade_auth_settings(actor_id, email_confirmation) VALUES (?, ?)';
        $sql .= $this->workspace->db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql'
            ? ' ON DUPLICATE KEY UPDATE actor_id = actor_id'
            : ' ON CONFLICT(actor_id) DO UPDATE SET actor_id = excluded.actor_id';
        $this->workspace->db->prepare($sql)->execute([$actor, (int) $this->defaultEmailConfirmation]);
    }

    private function key(): string
    {
        $handle = fopen($this->runtime.'/authentication.key', 'c+b');
        if (!$handle || !flock($handle, LOCK_EX)) {
            throw new \RuntimeException('Private authentication key unavailable.');
        }
        try {
            chmod($this->runtime.'/authentication.key', 0600);
            $key = stream_get_contents($handle);
            if ($key === '') {
                $key = random_bytes(32);
                rewind($handle);
                if (fwrite($handle, $key) !== 32 || !fflush($handle)) {
                    throw new \RuntimeException('Cannot persist authentication key.');
                }
            }
            if (strlen($key) !== 32) throw new \RuntimeException('Invalid private authentication key.');
            return $key;
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }
}
