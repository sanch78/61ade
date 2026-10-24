<?php

declare(strict_types=1);

namespace Blade\Admin;

use InvalidArgumentException;
use PDO;
use Blade\Feature\{Context, Failure, Field, Lookup, Registry, SqlResource, Workspace};
use Blade\Shell\IdentityProvider;

/**
 * Built-in role, membership and rule administration over the 61de ACL tables.
 * Choices come from the definition catalogue; nothing is granted automatically.
 * The protected role always keeps at least one active member and its admin rules.
 */
final class Permissions
{
    public const ROLES = 'blade_roles';
    public const MEMBERSHIPS = 'blade_memberships';
    public const ROLE_RULES = 'blade_role_rules';
    public const USER_RULES = 'blade_user_rules';
    public const ADMIN_RESOURCES = [Accounts::RESOURCE, self::ROLES, self::MEMBERSHIPS, self::ROLE_RULES, self::USER_RULES, ApiKeys::RESOURCE];

    private Catalogue $catalogue;

    public function __construct(
        private Workspace $workspace,
        private Accounts $accounts,
        private IdentityProvider $identities,
        public readonly string $protectedRole = 'admin',
    ) {
        if (!preg_match('/^[a-z][a-z0-9_]*$/D', $protectedRole)) throw new InvalidArgumentException('Invalid protected role key.');
        $this->catalogue = new Catalogue($workspace->registry);
        $accounts->guardDisable(fn(Context $ctx, string $id) => $this->keepOtherMember($id));
    }

    public function catalogue(): Catalogue
    {
        return $this->catalogue;
    }

    public function register(Registry $registry, ?string $group = 'Adminisztráció'): void
    {
        $roles = new Lookup(self::ROLES, 'blade_roles', 'id', 'name');
        $roleResource = new SqlResource(self::ROLES, 'blade_roles', 'id', [
            new Field('name', 'Név', required: true, max: 100, validation: ['unique' => true]),
            new Field('role_key', 'Kulcs', required: true, max: 100, validation: ['unique' => true, 'pattern' => ['expression' => '^[a-z][a-z0-9_]*$', 'message' => 'Kisbetűvel kezdődő kulcs (a–z, 0–9, _).']]),
        ], guard: function (Context $ctx, ?array $target, array $values): void {
            if ($target && isset($values['role_key']) && $values['role_key'] !== (string) $target['row']['role_key']) {
                throw new Failure('A kulcs létrehozás után nem módosítható.', 400, ['role_key' => 'A kulcs létrehozás után nem módosítható.']);
            }
        }, deleteGuard: function (Context $ctx, array $target): void {
            if ($target['row']['role_key'] === $this->protectedRole) throw new Failure('A védett szerepkör nem törölhető.', 403);
            $query = $ctx->db->prepare("SELECT (SELECT COUNT(*) FROM blade_memberships WHERE role_id = ?) + (SELECT COUNT(*) FROM blade_rules WHERE subject_type = 'role' AND subject_id = ?)");
            $query->execute([$target['id'], $target['id']]);
            if ((int) $query->fetchColumn() > 0) throw new Failure('A szerepkörnek még vannak tagjai vagy szabályai.', 409);
        });
        $roleResource->register($registry, 'Szerepkörök', group: $group);
        $roleResource->registerDelete($registry);

        $memberships = new SqlResource(self::MEMBERSHIPS, 'blade_memberships', 'id', [
            new Field('actor_id', 'Felhasználó', 'select', required: true, max: 100, options: $this->accounts->lookup()->options(...)),
            new Field('role_id', 'Szerepkör', 'select', required: true, max: 100, options: $roles->options(...)),
        ], deleteGuard: fn(Context $ctx, array $target) => $this->checkMembershipRemoval($ctx, $target['row']), unique: [['actor_id', 'role_id']]);
        $memberships->register($registry, 'Szerepkör-tagságok', update: false, group: $group);
        $memberships->registerDelete($registry);

        foreach ([
            [self::ROLE_RULES, 'role', 'Szerepkör-jogosultságok', 'Szerepkör', $roles],
            [self::USER_RULES, 'user', 'Egyedi jogosultságok', 'Felhasználó', $this->accounts->lookup()],
        ] as [$resource, $type, $title, $subjectLabel, $subjects]) {
            $rules = new SqlResource($resource, 'blade_rules', 'id', [
                new Field('subject_id', $subjectLabel, 'select', required: true, max: 100, options: $subjects->options(...)),
                new Field('resource', 'Erőforrás', 'select', required: true, max: 100, options: fn(Context $ctx) => $this->choices($ctx, 'resource', $this->catalogue->resources())),
                new Field('action', 'Művelet', 'select', required: true, max: 100, options: fn(Context $ctx) => $this->choices($ctx, 'action', $this->catalogue->actions())),
                new Field('channel', 'Csatorna', 'select', required: true, max: 10, options: ['ui' => 'Felület (ui)', 'api' => 'API']),
                new Field('effect', 'Hatás', 'select', required: true, max: 10, options: ['allow' => 'Engedély', 'deny' => 'Tiltás']),
                new Field('scope', 'Hatókör', 'select', required: true, max: 10, options: ['all' => 'Minden objektum', 'own' => 'Saját objektum', 'id' => 'Konkrét objektum']),
                new Field('object_id', 'Objektumazonosító', max: 100),
                new Field('field_name', 'Mező', max: 100),
            ], defaults: ['subject_type' => $type],
                guard: fn(Context $ctx, ?array $target, array $values) => $this->checkRule($target, array_replace($target['row'] ?? [], $values)),
                where: "subject_type = '$type'",
                deleteGuard: function (Context $ctx, array $target): void {
                    if ($this->protectedAdminRule($target['row'])) throw new Failure('A védett szerepkör adminjogai a felületen nem módosíthatók.', 403);
                },
                // Allow and deny for the same subject and target would only contradict each other (deny wins).
                unique: [['subject_type', 'subject_id', 'resource', 'action', 'channel', 'scope', 'object_id', 'field_name']]);
            $rules->register($registry, $title, group: $group);
            $rules->registerDelete($registry);
        }
    }

    /**
     * Explicit installer step for the first administrator: protected role, membership
     * and UI allow rules for every built-in admin action. Idempotent and audited.
     */
    public static function grantAdministration(PDO $db, Registry $registry, string $actorId, string $protectedRole = 'admin', string $roleName = 'Adminisztrátor'): void
    {
        $db->beginTransaction();
        try {
            $query = $db->prepare('SELECT id FROM blade_roles WHERE role_key = ?');
            $query->execute([$protectedRole]);
            $roleId = $query->fetchColumn();
            if ($roleId === false) {
                $taken = $db->prepare('SELECT COUNT(*) FROM blade_roles WHERE name = ?');
                $taken->execute([$roleName]);
                $db->prepare('INSERT INTO blade_roles (name, role_key) VALUES (?, ?)')->execute([$taken->fetchColumn() ? $protectedRole : $roleName, $protectedRole]);
                $roleId = $db->lastInsertId();
            }
            $roleId = (string) $roleId;
            $query = $db->prepare('SELECT COUNT(*) FROM blade_memberships WHERE actor_id = ? AND role_id = ?');
            $query->execute([$actorId, $roleId]);
            if (!$query->fetchColumn()) $db->prepare('INSERT INTO blade_memberships (actor_id, role_id) VALUES (?, ?)')->execute([$actorId, $roleId]);
            $exists = $db->prepare("SELECT COUNT(*) FROM blade_rules WHERE subject_type = 'role' AND subject_id = ? AND resource = ? AND action = ? AND channel = 'ui' AND effect = 'allow' AND scope = 'all' AND field_name = ''");
            $grant = $db->prepare("INSERT INTO blade_rules (subject_type, subject_id, resource, action, channel, effect, scope, object_id, field_name) VALUES ('role', ?, ?, ?, 'ui', 'allow', 'all', '', '')");
            foreach ((new Catalogue($registry))->entries() as $entry) {
                if (!in_array($entry['resource'], self::ADMIN_RESOURCES, true) || !in_array('ui', $entry['channels'], true)) continue;
                $exists->execute([$roleId, $entry['resource'], $entry['action']]);
                if (!$exists->fetchColumn()) $grant->execute([$roleId, $entry['resource'], $entry['action']]);
            }
            (new \Blade\Audit\Journal($db))->record('', 'cli', self::ROLES, 'grant_administration', $actorId, 'success');
            $db->commit();
        } catch (\Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
    }

    /** Catalogue choices plus values already stored in rules, so orphaned rules stay visible. */
    private function choices(Context $ctx, string $column, array $known): array
    {
        foreach ($ctx->db->query("SELECT DISTINCT $column FROM blade_rules")->fetchAll(PDO::FETCH_COLUMN) as $value) {
            $known[(string) $value] ??= \Blade\I18n\Translator::text('{value} — nincs a katalógusban', ['value' => $value]);
        }
        return $known;
    }

    private function checkRule(?array $target, array $rule): void
    {
        if ($target && $this->protectedAdminRule($target['row'])) throw new Failure('A védett szerepkör adminjogai a felületen nem módosíthatók.', 403);
        if (!$this->catalogue->allows((string) $rule['resource'], (string) $rule['action'], (string) $rule['channel'])) {
            throw new Failure('A művelet nem szerepel a katalógusban ezen az erőforráson és csatornán.', 400, ['action' => 'A művelet nem szerepel a katalógusban ezen az erőforráson és csatornán.']);
        }
        $field = (string) ($rule['field_name'] ?? '');
        if ($field !== '' && !in_array($field, $this->catalogue->fields((string) $rule['resource']), true)) {
            throw new Failure('Ismeretlen mező ezen az erőforráson.', 400, ['field_name' => 'Ismeretlen mező ezen az erőforráson.']);
        }
        $object = (string) ($rule['object_id'] ?? '');
        if (($rule['scope'] === 'id') !== ($object !== '')) {
            throw new Failure('Objektumazonosító pontosan a „Konkrét objektum” hatókörnél kell.', 400, ['object_id' => 'Objektumazonosító pontosan a „Konkrét objektum” hatókörnél kell.']);
        }
        if ($rule['effect'] === 'deny' && in_array($rule['resource'], self::ADMIN_RESOURCES, true)) {
            throw new Failure('61de-adminerőforrásra tiltó szabály a felületen nem hozható létre.', 403);
        }
    }

    private function protectedAdminRule(array $row): bool
    {
        return ($row['subject_type'] ?? '') === 'role'
            && (string) ($row['subject_id'] ?? '') === $this->protectedRoleId()
            && in_array($row['resource'] ?? '', self::ADMIN_RESOURCES, true);
    }

    private function checkMembershipRemoval(Context $ctx, array $row): void
    {
        if ((string) $row['role_id'] !== $this->protectedRoleId()) return;
        if ((string) $row['actor_id'] === $ctx->actor->id) throw new Failure('A saját védett szerepkör-tagság nem vonható vissza.', 403);
        $this->keepOtherMember((string) $row['actor_id']);
    }

    /** Rejects a change that would leave the protected role without an active member. */
    private function keepOtherMember(string $actor): void
    {
        $role = $this->protectedRoleId();
        if ($role === '') return;
        $db = $this->workspace->db;
        if ($db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') $db->prepare('SELECT id FROM blade_roles WHERE id = ? FOR UPDATE')->execute([$role]);
        $query = $db->prepare('SELECT actor_id FROM blade_memberships WHERE role_id = ?');
        $query->execute([$role]);
        $members = array_map('strval', $query->fetchAll(PDO::FETCH_COLUMN));
        if (!in_array($actor, $members, true)) return;
        foreach ($members as $member) if ($member !== $actor && $this->identities->find($member)) return;
        throw new Failure('A védett szerepkörnek legalább egy aktív tagja kell maradjon.', 409);
    }

    private function protectedRoleId(): string
    {
        $query = $this->workspace->db->prepare('SELECT id FROM blade_roles WHERE role_key = ?');
        $query->execute([$this->protectedRole]);
        return (string) ($query->fetchColumn() ?: '');
    }
}
