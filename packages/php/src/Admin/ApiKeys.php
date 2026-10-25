<?php

declare(strict_types=1);

namespace Blade\Admin;

use Blade\Feature\{Context, Failure, Field, Registry, SqlResource};
use Blade\I18n\Translator;

/**
 * Built-in API key administration over blade_tokens. Only a hash is stored; the secret
 * is shown once after creation. A key never grants more than its owner's API ACL:
 * the chosen operations only narrow it. Revocation is a one-way checkbox.
 */
final class ApiKeys
{
    public const RESOURCE = 'blade_api_keys';

    public function __construct(private Accounts $accounts, private Catalogue $catalogue, public readonly int $maxDays = 365)
    {
        if ($maxDays < 1 || $maxDays > 3650) throw new \InvalidArgumentException('Invalid API key lifetime.');
    }

    public function register(Registry $registry, ?string $group = null): void
    {
        $resource = new SqlResource(self::RESOURCE, 'blade_tokens', 'id', [
            new Field('label', 'Megnevezés', required: true, max: 100),
            new Field('actor_id', 'Tulajdonos', 'select', max: 100, options: $this->accounts->ownerOptions(...)),
            new Field('scopes', 'Engedélyezett műveletek', 'multiselect', required: true, max: 4000, options: fn(Context $ctx): array => $this->operations()),
            new Field('expires_at', 'Lejárat', required: true, max: 30, defaultValue: gmdate('Y-m-d', time() + min(90, $this->maxDays) * 86400), validation: [
                'pattern' => ['expression' => '^[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9]{2}:[0-9]{2}:[0-9]{2}Z)?$', 'message' => 'ÉÉÉÉ-HH-NN formátumú dátum szükséges.'],
            ]),
            new Field('revoked', 'Visszavonva', 'checkbox', column: ['editable' => true, 'align' => 'center', 'width' => 120]),
        ],
            ownerColumn: 'actor_id',
            acceptOwnerInput: true,
            guard: fn(Context $ctx, ?array $target, array $values) => $this->check($ctx, $target, $values),
            normalize: fn(Context $ctx, ?array $target, array $values): array => $this->normalize($ctx, $target, $values),
            afterSave: fn(Context $ctx, string $id, ?array $target, array $values): ?array => $target ? null : $this->issue($ctx, $id),
        );
        $resource->register($registry, 'API-kulcsok', group: $group);
        foreach ($registry->views() as $view) {
            if ($view['resource'] === self::RESOURCE) $registry->view(self::RESOURCE, $view['title'], $view['columns'], $view['actions'], group: $view['group'], layout: $view['layout'], icon: 'dxi dxi-key');
        }
    }

    /** "resource.action" => label for every catalogue operation exposed on the API channel. */
    private function operations(): array
    {
        $out = [];
        foreach ($this->catalogue->entries() as $entry) {
            if (!in_array('api', $entry['channels'], true)) continue;
            $key = $entry['resource'].'.'.$entry['action'];
            $out[$key] = Translator::text($entry['resource_label']).' · '.Translator::text($entry['label']).' ('.$key.')';
        }
        return $out;
    }

    private function check(Context $ctx, ?array $target, array $values): void
    {
        $row = $target['row'] ?? [];
        $owner = trim((string) ($values['actor_id'] ?? $row['actor_id'] ?? ($target ? '' : $ctx->actor->id)));
        if ($owner === '' && !$target) $owner = $ctx->actor->id;
        if ($owner === '' || !$ctx->acl->allows($ctx->actor->id, self::RESOURCE, $target ? 'update' : 'create', $ctx->channel, $target['id'] ?? null, $owner)) {
            throw new Failure('API-kulcs csak a saját fiókhoz vagy erre külön engedélyezett fiókhoz adható.', 403, ['actor_id' => 'Nincs jogosultság ehhez a tulajdonoshoz.']);
        }
        if ($target && (string) $row['revoked'] === '1' && (string) ($values['revoked'] ?? '1') === '0') {
            throw new Failure('A visszavont kulcs nem állítható vissza; adj ki újat.', 409, ['revoked' => 'A visszavont kulcs nem állítható vissza; adj ki újat.']);
        }
        if ($target && isset($values['actor_id']) && (string) $values['actor_id'] !== (string) $row['actor_id']) {
            throw new Failure('A kulcs tulajdonosa kiadás után nem módosítható.', 400, ['actor_id' => 'A kulcs tulajdonosa kiadás után nem módosítható.']);
        }
        if (!isset($values['expires_at']) || ($target && $values['expires_at'] === (string) $row['expires_at'])) return;
        $expires = self::expiry((string) $values['expires_at']);
        if ($expires === null || $expires <= time() || $expires > time() + $this->maxDays * 86400) {
            $message = Translator::text('A lejárat a jövőben, legfeljebb {days} napon belül legyen.', ['days' => $this->maxDays]);
            throw new Failure($message, 400, ['expires_at' => $message]);
        }
    }

    private function normalize(Context $ctx, ?array $target, array $values): array
    {
        if (!array_key_exists('actor_id', $values) || (string) $values['actor_id'] === '') $values['actor_id'] = (string) ($target['row']['actor_id'] ?? $ctx->actor->id);
        if (isset($values['expires_at']) && ($expires = self::expiry((string) $values['expires_at'])) !== null) {
            $values['expires_at'] = gmdate('Y-m-d\TH:i:s\Z', $expires);
        }
        // Unknowable placeholder until the real secret is issued in the same transaction.
        if (!$target) $values['token_hash'] = hash('sha256', random_bytes(32));
        return $values;
    }

    /** A bare date means the end of that UTC day. */
    private static function expiry(string $value): ?int
    {
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})Z)?$/D', $value, $parts) || !checkdate((int) $parts[2], (int) $parts[3], (int) $parts[1])) return null;
        return isset($parts[4]) ? gmmktime((int) $parts[4], (int) $parts[5], (int) $parts[6], (int) $parts[2], (int) $parts[3], (int) $parts[1])
            : gmmktime(23, 59, 59, (int) $parts[2], (int) $parts[3], (int) $parts[1]);
    }

    private function issue(Context $ctx, string $id): array
    {
        $secret = bin2hex(random_bytes(32));
        $ctx->db->prepare('UPDATE blade_tokens SET token_hash = ? WHERE id = ?')->execute([hash('sha256', $secret), $id]);
        return ['id' => $id, 'reveal' => [
            'label' => Translator::text('API-kulcs (egyszer jelenik meg)'),
            'value' => $secret,
            'note' => Translator::text('Használat: Authorization: Bearer <kulcs>. Csak a kiválasztott műveletekre, a tulajdonos API-jogosultságain belül érvényes.'),
        ]];
    }
}
