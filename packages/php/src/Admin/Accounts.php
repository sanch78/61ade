<?php

declare(strict_types=1);

namespace Blade\Admin;

use Closure;
use InvalidArgumentException;
use PDO;
use Blade\Feature\{Action, Context, Failure, Field, Lookup, Registry, RelatedStorage, SqlResource, ValidationRules, Workspace};
use Blade\I18n\{Settings, Translator};
use Blade\Shell\IdentityProvider;

/**
 * Framework-owned user administration over the consumer's mapped account table.
 * 61ade state (disabled, forced password change, OAuth permission, default language)
 * lives in blade_account_state, so the consumer schema is not altered. The sign-in
 * identifier is the e-mail address. Account switches are plain checkbox fields on
 * the form and the grid; there are no single-purpose toggle actions.
 */
final class Accounts
{
    public const RESOURCE = 'blade_users';
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
        private ?Settings $languages = null,
        public readonly bool $oauth = false,
        private ?bool $emailConfirmation = null,
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

    /**
     * Returns account choices visible to a relation field, always including the
     * current actor so self-scoped features do not require account-admin access.
     */
    public function ownerOptions(Context $ctx): array
    {
        $options = $this->lookup()->options($ctx);
        $query = $this->workspace->db->prepare("SELECT {$this->emailColumn} FROM {$this->table} WHERE {$this->idColumn} = ?");
        $query->execute([$ctx->actor->id]);
        $email = $query->fetchColumn();
        if ($email !== false) $options[$ctx->actor->id] ??= (string) $email;
        return $options;
    }

    public function identities(IdentityProvider $inner): IdentityProvider
    {
        return new ManagedIdentities($inner, $this);
    }

    public function state(string $actor): array
    {
        $query = $this->workspace->db->prepare('SELECT disabled, must_change_password, temporary_expires_at, oauth_allowed, locale FROM blade_account_state WHERE actor_id = ?');
        $query->execute([$actor]);
        $row = $query->fetch(PDO::FETCH_ASSOC) ?: [];
        return [
            'disabled' => (bool) ($row['disabled'] ?? false),
            'must_change' => (bool) ($row['must_change_password'] ?? false),
            'expires' => (int) ($row['temporary_expires_at'] ?? 0),
            'oauth' => (bool) ($row['oauth_allowed'] ?? false),
            'locale' => (string) ($row['locale'] ?? ''),
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

    /** External sign-in needs the per-account switch; the password state is irrelevant there. */
    public function oauthAllowed(string $actor): bool
    {
        $state = $this->state($actor);
        return $this->oauth && $state['oauth'] && !$state['disabled'];
    }

    public function mustChangePassword(string $actor): bool
    {
        return $this->state($actor)['must_change'];
    }

    /** The account's default language, only when the site still offers it. */
    public function locale(string $actor): ?string
    {
        $locale = $this->state($actor)['locale'];
        return $locale !== '' && isset($this->languages?->languages[$locale]) ? $locale : null;
    }

    /** Exact (normalized) e-mail match; never a fuzzy or domain-based account link. */
    public function actorByEmail(string $email): ?string
    {
        $email = mb_strtolower(trim($email));
        if ($email === '' || strlen($email) > 254) return null;
        $query = $this->workspace->db->prepare("SELECT {$this->idColumn} FROM {$this->table} WHERE {$this->emailColumn} = ?");
        $query->execute([$email]);
        $ids = $query->fetchAll(PDO::FETCH_COLUMN);
        return count($ids) === 1 ? (string) $ids[0] : null;
    }

    public function register(Registry $registry, string $title = 'Felhasználók', ?string $group = 'Adminisztráció'): void
    {
        $switch = ['editable' => true, 'align' => 'center', 'width' => 120];
        $fields = [
            new Field($this->nameColumn, 'Teljes név', required: true, max: 200),
            new Field($this->emailColumn, 'E-mail', required: true, max: 254, validation: [
                'unique' => true,
                'pattern' => ['expression' => '^[^@\s]+@[^@\s]+\.[^@\s]+$', 'message' => 'Érvényes e-mail-cím szükséges.'],
            ]),
            new Field('blade_disabled', 'Tiltva', 'checkbox', column: $switch),
            new Field('blade_must_change', 'Jelszócsere szükséges', 'checkbox', column: ['align' => 'center', 'width' => 120, 'secondary' => true]),
        ];
        $state = ['blade_disabled' => 'disabled', 'blade_must_change' => 'must_change_password'];
        $defaults = ['blade_disabled' => 0, 'blade_must_change' => 0];
        if ($this->oauth) {
            $fields[] = new Field('blade_oauth', 'OAuth-belépés', 'checkbox', column: [...$switch, 'secondary' => true]);
            $state['blade_oauth'] = 'oauth_allowed';
            $defaults['blade_oauth'] = 0;
        }
        // One site language means no choice and no per-user language.
        if ($this->languages && count($this->languages->languages) > 1) {
            $fields[] = new Field('blade_locale', 'Alapnyelv', 'select', max: 16, options: ['' => 'Site alapértelmezése', ...$this->languages->languages], column: ['width' => 140, 'editable' => true, 'secondary' => true]);
            $state['blade_locale'] = 'locale';
            $defaults['blade_locale'] = '';
        }
        $related = [new RelatedStorage('blade_account_state', 'actor_id', $state, $defaults)];
        if ($this->emailConfirmation !== null) {
            $fields[] = new Field('blade_email_confirmation', 'E-mailes megerősítés', 'checkbox', defaultValue: $this->emailConfirmation ? '1' : '0', column: [...$switch, 'secondary' => true]);
            $related[] = new RelatedStorage('blade_auth_settings', 'actor_id', ['blade_email_confirmation' => 'email_confirmation'], ['blade_email_confirmation' => (int) $this->emailConfirmation]);
        }
        if ($this->workspace->tenancy) {
            $fields[] = $this->workspace->tenancy->membershipField();
            $related[] = \Blade\Tenancy\Tenancy::members(true, 'blade_tenant_ids');
        }
        $this->resource = new SqlResource(
            self::RESOURCE, $this->table, $this->idColumn, $fields,
            defaults: [$this->passwordColumn => '', ...$this->createDefaults],
            guard: fn(Context $ctx, ?array $target, array $values) => $this->checkState($ctx, $target, $values),
            normalize: fn(Context $ctx, ?array $target, array $values): array => isset($values[$this->emailColumn])
                ? [...$values, $this->emailColumn => mb_strtolower(trim((string) $values[$this->emailColumn]))]
                : $values,
            afterSave: fn(Context $ctx, string $id, ?array $target, array $values): ?array => $this->saved($ctx, $id, $target, $values),
            related: $related,
            readOnly: ['blade_must_change'],
        );
        $this->resource->register($registry, $title, create: $this->creatable, group: $group);
        $resolve = fn(Context $ctx, ?string $id): array => $this->resource->target($ctx, $id);
        $registry->add(new Action(self::RESOURCE, 'temporary_password', 'Ideiglenes jelszó', [], function (Context $ctx, array $target): array {
            if ($target['id'] === $ctx->actor->id) throw new Failure('A saját jelszavadat a jelszócsere művelettel módosítsd.', 403);
            return $this->issueTemporary($ctx, $target['id']);
        }, resolve: $resolve, write: true, icon: 'dxi dxi-key'));
        foreach ($registry->views() as $view) {
            if ($view['resource'] !== self::RESOURCE) continue;
            $registry->view(self::RESOURCE, $view['title'], $view['columns'], [...$view['actions'], 'temporary_password'], group: $view['group'], layout: $view['layout'], icon: 'dxi dxi-person');
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

    /** Runs inside the save transaction, before anything is written. */
    private function checkState(Context $ctx, ?array $target, array $values): void
    {
        if (!$target || (string) ($values['blade_disabled'] ?? '0') !== '1' || (string) ($target['row']['blade_disabled'] ?? '0') === '1') return;
        if ($target['id'] === $ctx->actor->id) throw new Failure('A saját fiók nem tiltható le.', 403, ['blade_disabled' => 'A saját fiók nem tiltható le.']);
        foreach ($this->disableGuards as $guard) $guard($ctx, $target['id']);
    }

    private function saved(Context $ctx, string $id, ?array $target, array $values): ?array
    {
        if (!$target) return $this->issueTemporary($ctx, $id);
        $before = $target['row'];
        $changed = static fn(string $field): bool => array_key_exists($field, $values) && (string) $values[$field] !== (string) ($before[$field] ?? '');
        // Disabling, losing external sign-in or changing the second factor ends every session,
        // remembered login and token of the account; the sign-in identifier works the same way.
        $revoke = ($changed('blade_disabled') && (string) $values['blade_disabled'] === '1')
            || ($changed('blade_oauth') && (string) $values['blade_oauth'] === '0')
            || $changed('blade_email_confirmation')
            || (isset($values[$this->emailColumn]) && $values[$this->emailColumn] !== mb_strtolower((string) ($before[$this->emailColumn] ?? '')));
        if (!$revoke) return null;
        $this->workspace->revokeSessions($id);
        $ctx->acl->invalidate();
        return $id === $ctx->actor->id ? ['reauthenticate' => true] : null;
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
        $query = $db->prepare('SELECT actor_id FROM blade_account_state WHERE actor_id = ?');
        $query->execute([$actor]);
        if ($query->fetchColumn() === false) {
            $values = ['disabled' => 0, 'must_change_password' => 0, 'temporary_expires_at' => 0, ...$values];
            $query = $db->prepare('INSERT INTO blade_account_state (actor_id, '.implode(', ', array_keys($values)).') VALUES (?'.str_repeat(', ?', count($values)).')');
            $query->execute([$actor, ...array_values($values)]);
            return;
        }
        $query = $db->prepare('UPDATE blade_account_state SET '.implode(', ', array_map(static fn($column) => "$column = ?", array_keys($values))).' WHERE actor_id = ?');
        $query->execute([...array_values($values), $actor]);
    }
}
