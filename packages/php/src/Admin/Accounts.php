<?php

declare(strict_types=1);

namespace Vapa\Admin;

use Closure;
use InvalidArgumentException;
use PDO;
use Vapa\Feature\{Action, Context, Failure, Field, Lookup, Registry, RelatedStorage, SqlResource, ValidationRules, Workspace};
use Vapa\I18n\Translator;
use Vapa\Shell\IdentityProvider;

/**
 * Framework-owned user administration over the consumer's mapped account table.
 * VAPA state (disabled, forced password change) lives in vapa_account_state, so the
 * consumer schema is not altered. The sign-in identifier is the e-mail address.
 */
final class Accounts
{
    public const RESOURCE = 'vapa_users';
    private const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

    private Closure $encode;
    private Closure $verify;
    private ?SqlResource $resource = null;
    private array $disableGuards = [];

    public function __construct(
        private Workspace $workspace,
        private string $table,
        private string $idColumn,
        private string $emailColumn,
        private string $nameColumn,
        private string $passwordColumn,
        ?Closure $encode = null,
        ?Closure $verify = null,
        private array $createDefaults = [],
        public readonly bool $creatable = true,
        public readonly int $temporaryHours = 72,
    ) {
        foreach ([$table, $idColumn, $emailColumn, $nameColumn, $passwordColumn, ...array_keys($createDefaults)] as $identifier) {
            if (!is_string($identifier) || !preg_match('/^[a-z_][a-z0-9_]*$/D', $identifier)) {
                throw new InvalidArgumentException('Invalid account administration identifier.');
            }
        }
        if (array_intersect(array_keys($createDefaults), [$idColumn, $emailColumn, $nameColumn, $passwordColumn])) {
            throw new InvalidArgumentException('Create defaults cannot set identity columns.');
        }
        foreach ($createDefaults as $value) {
            if (!is_int($value) && !is_string($value)) throw new InvalidArgumentException('Create defaults must be strings or integers.');
        }
        // A custom hash format must come with its encoder, otherwise new passwords could not be verified.
        if ($verify && !$encode) throw new InvalidArgumentException('A custom password verifier requires a password encoder.');
        if ($temporaryHours < 1 || $temporaryHours > 720) throw new InvalidArgumentException('Invalid temporary password lifetime.');
        $this->encode = $encode ?? static fn(string $password): string => password_hash($password, PASSWORD_DEFAULT);
        $this->verify = $verify ?? static fn(string $password, string $hash): bool => password_verify($password, $hash);
    }

    /** Registers a check that runs inside the disable transaction, e.g. last-admin protection. */
    public function guardDisable(Closure $guard): void
    {
        $this->disableGuards[] = $guard;
    }

    /** ACL-scoped account choices (e-mail labels) for relation fields such as memberships. */
    public function lookup(): Lookup
    {
        return new Lookup(self::RESOURCE, $this->table, $this->idColumn, $this->emailColumn);
    }

    public function identities(IdentityProvider $inner): IdentityProvider
    {
        return new ManagedIdentities($inner, $this);
    }

    public function state(string $actor): array
    {
        $query = $this->workspace->db->prepare('SELECT disabled, must_change_password, temporary_expires_at FROM vapa_account_state WHERE actor_id = ?');
        $query->execute([$actor]);
        $row = $query->fetch(PDO::FETCH_ASSOC) ?: [];
        return [
            'disabled' => (bool) ($row['disabled'] ?? false),
            'must_change' => (bool) ($row['must_change_password'] ?? false),
            'expires' => (int) ($row['temporary_expires_at'] ?? 0),
        ];
    }

    public function available(string $actor): bool
    {
        return !$this->state($actor)['disabled'];
    }

    public function loginAllowed(string $actor): bool
    {
        $state = $this->state($actor);
        return !$state['disabled'] && !($state['must_change'] && $state['expires'] <= time());
    }

    public function mustChangePassword(string $actor): bool
    {
        return $this->state($actor)['must_change'];
    }

    public function register(Registry $registry, string $title = 'Felhasználók', ?string $group = 'Adminisztráció'): void
    {
        $this->resource = new SqlResource(
            self::RESOURCE, $this->table, $this->idColumn,
            [
                new Field($this->nameColumn, 'Teljes név', required: true, max: 200),
                new Field($this->emailColumn, 'E-mail', required: true, max: 254, validation: [
                    'unique' => true,
                    'pattern' => ['expression' => '^[^@\s]+@[^@\s]+\.[^@\s]+$', 'message' => 'Érvényes e-mail-cím szükséges.'],
                ]),
                new Field('vapa_disabled', 'Tiltva', 'checkbox'),
                new Field('vapa_must_change', 'Jelszócsere szükséges', 'checkbox'),
            ],
            defaults: [$this->passwordColumn => '', ...$this->createDefaults],
            normalize: fn(Context $ctx, ?array $target, array $values): array => isset($values[$this->emailColumn])
                ? [...$values, $this->emailColumn => mb_strtolower(trim((string) $values[$this->emailColumn]))]
                : $values,
            afterSave: fn(Context $ctx, string $id, ?array $target, array $values): ?array => $this->saved($ctx, $id, $target, $values),
            related: [new RelatedStorage('vapa_account_state', 'actor_id', ['vapa_disabled' => 'disabled', 'vapa_must_change' => 'must_change_password'], ['vapa_disabled' => 0, 'vapa_must_change' => 0])],
            readOnly: ['vapa_disabled', 'vapa_must_change'],
        );
        $this->resource->register($registry, $title, create: $this->creatable, group: $group);
        $resolve = fn(Context $ctx, ?string $id): array => $this->resource->target($ctx, $id);
        $registry->add(new Action(self::RESOURCE, 'deactivate', 'Tiltás', [], fn(Context $ctx, array $target): array => $this->setDisabled($ctx, $target['id'], true), resolve: $resolve, write: true, icon: 'dxi dxi-close-circle'));
        $registry->add(new Action(self::RESOURCE, 'reactivate', 'Visszaengedés', [], fn(Context $ctx, array $target): array => $this->setDisabled($ctx, $target['id'], false), resolve: $resolve, write: true, icon: 'dxi dxi-undo'));
        $registry->add(new Action(self::RESOURCE, 'temporary_password', 'Ideiglenes jelszó', [], function (Context $ctx, array $target): array {
            if ($target['id'] === $ctx->actor->id) throw new Failure('A saját jelszavadat a jelszócsere művelettel módosítsd.', 403);
            return $this->issueTemporary($ctx, $target['id']);
        }, resolve: $resolve, write: true, icon: 'dxi dxi-key'));
        foreach ($registry->views() as $view) {
            if ($view['resource'] !== self::RESOURCE) continue;
            $registry->view(self::RESOURCE, $view['title'], $view['columns'], [...$view['actions'], 'deactivate', 'reactivate', 'temporary_password'], group: $view['group'], layout: $view['layout'], icon: 'dxi dxi-person');
        }
    }

    /** Completes the forced change after a successful temporary-password sign-in. */
    public function completeForcedChange(string $actor, #[\SensitiveParameter] string $password, #[\SensitiveParameter] string $confirmation): void
    {
        $db = $this->workspace->db;
        $db->beginTransaction();
        try {
            $state = $this->state($actor);
            if (!$state['must_change'] || $state['disabled']) throw new Failure('Nincs folyamatban lévő jelszócsere.', 401);
            if ($state['expires'] <= time()) throw new Failure('Az ideiglenes jelszó lejárt. Kérj új ideiglenes jelszót az adminisztrátortól.', 401);
            $length = ValidationRules::length($password);
            if ($length < 12 || $length > 128) throw new Failure('Az új jelszó 12–128 karakter legyen.', 400, ['new_password' => 'Az új jelszó 12–128 karakter legyen.']);
            if (!hash_equals($password, $confirmation)) throw new Failure('A két új jelszó eltér.', 400, ['confirm_password' => 'A két új jelszó eltér.']);
            $query = $db->prepare("SELECT {$this->passwordColumn} FROM {$this->table} WHERE {$this->idColumn} = ?");
            $query->execute([$actor]);
            $hash = $query->fetchColumn();
            if ($hash === false) throw new Failure('A fiók nem érhető el.', 401);
            if (($this->verify)($password, (string) $hash)) {
                throw new Failure('Az új jelszó nem egyezhet az ideiglenes jelszóval.', 400, ['new_password' => 'Az új jelszó nem egyezhet az ideiglenes jelszóval.']);
            }
            $this->writePassword($actor, $password);
            $this->writeState($actor, ['must_change_password' => 0, 'temporary_expires_at' => 0]);
            $this->workspace->revokeSessions($actor);
            $this->workspace->journal->record($actor, 'ui', 'authentication', 'password_change_forced', '', 'success');
            $db->commit();
        } catch (\Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            $this->workspace->journal->record($actor, 'ui', 'authentication', 'password_change_forced', '', $error instanceof Failure ? 'rejected' : 'error');
            throw $error;
        }
    }

    private function saved(Context $ctx, string $id, ?array $target, array $values): ?array
    {
        if (!$target) return $this->issueTemporary($ctx, $id);
        $previous = mb_strtolower((string) ($target['row'][$this->emailColumn] ?? ''));
        if (isset($values[$this->emailColumn]) && $values[$this->emailColumn] !== $previous) {
            // The sign-in identifier changed: every session, remembered login and token of the account ends.
            $this->workspace->revokeSessions($id);
            if ($id === $ctx->actor->id) return ['reauthenticate' => true];
        }
        return null;
    }

    private function setDisabled(Context $ctx, string $id, bool $disabled): array
    {
        if ($disabled && $id === $ctx->actor->id) throw new Failure('A saját fiók nem tiltható le.', 403);
        if ($this->state($id)['disabled'] === $disabled) {
            throw new Failure($disabled ? 'A fiók már tiltott.' : 'A fiók nincs tiltva.', 409);
        }
        if ($disabled) foreach ($this->disableGuards as $guard) $guard($ctx, $id);
        $this->writeState($id, ['disabled' => (int) $disabled]);
        if ($disabled) $this->workspace->revokeSessions($id);
        $ctx->acl->invalidate();
        return ['id' => $id];
    }

    private function issueTemporary(Context $ctx, string $id): array
    {
        $password = '';
        for ($i = 0; $i < 20; $i++) $password .= self::ALPHABET[random_int(0, strlen(self::ALPHABET) - 1)];
        $this->writePassword($id, $password);
        $this->writeState($id, ['must_change_password' => 1, 'temporary_expires_at' => time() + $this->temporaryHours * 3600]);
        $this->workspace->revokeSessions($id);
        return ['id' => $id, 'reveal' => [
            'label' => Translator::text('Ideiglenes jelszó (egyszer jelenik meg)'),
            'value' => $password,
            'note' => Translator::text('Érvényes {hours} óráig; első belépéskor kötelező lecserélni.', ['hours' => $this->temporaryHours]),
        ]];
    }

    private function writePassword(string $actor, #[\SensitiveParameter] string $password): void
    {
        $query = $this->workspace->db->prepare("UPDATE {$this->table} SET {$this->passwordColumn} = ? WHERE {$this->idColumn} = ?");
        $query->execute([($this->encode)($password), $actor]);
    }

    private function writeState(string $actor, array $values): void
    {
        $db = $this->workspace->db;
        $query = $db->prepare('SELECT actor_id FROM vapa_account_state WHERE actor_id = ?');
        $query->execute([$actor]);
        if ($query->fetchColumn() === false) {
            $values = ['disabled' => 0, 'must_change_password' => 0, 'temporary_expires_at' => 0, ...$values];
            $query = $db->prepare('INSERT INTO vapa_account_state (actor_id, '.implode(', ', array_keys($values)).') VALUES (?'.str_repeat(', ?', count($values)).')');
            $query->execute([$actor, ...array_values($values)]);
            return;
        }
        $query = $db->prepare('UPDATE vapa_account_state SET '.implode(', ', array_map(static fn($column) => "$column = ?", array_keys($values))).' WHERE actor_id = ?');
        $query->execute([...array_values($values), $actor]);
    }
}
