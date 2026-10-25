<?php

declare(strict_types=1);

namespace Blade\Authentication;

use PDO;
use Blade\Feature\Context;
use Blade\Feature\Workspace;

final readonly class Settings
{
    public function __construct(private PDO $db, private bool $defaultEmailConfirmation = true)
    {
    }

    public function get(string $actor): array
    {
        $query = $this->db->prepare('SELECT email_confirmation FROM blade_auth_settings WHERE actor_id = ?');
        $query->execute([$actor]);
        $value = $query->fetchColumn();
        return ['email_confirmation' => $value === false ? (int) $this->defaultEmailConfirmation : (int) $value];
    }

    /** Called as an ACL-checked registered action inside the common transaction. */
    public function update(Context $context, Workspace $workspace, string $actor, bool $enabled): array
    {
        $query = $this->db->prepare('SELECT actor_id FROM blade_auth_settings WHERE actor_id = ?');
        $query->execute([$actor]);
        if ($query->fetchColumn() === false) {
            $query = $this->db->prepare('INSERT INTO blade_auth_settings(email_confirmation, actor_id) VALUES (?, ?)');
        } else {
            $query = $this->db->prepare('UPDATE blade_auth_settings SET email_confirmation = ? WHERE actor_id = ?');
        }
        $query->execute([(int) $enabled, $actor]);
        $workspace->revokeSessions($actor);
        return ['reauthenticate' => $actor === $context->actor->id];
    }
}
