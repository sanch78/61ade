<?php
declare(strict_types=1);
namespace Blade\Feature;
use Blade\Shell\Identity;
use Blade\Access\Acl;
/**
 * $uploads: Upload parts of a multipart request, only for actions that accept them.
 * $owner: SHA-256 of the session id (ui) or bearer token (api), set by Workspace::http for every request; it binds
 * short-lived server state (upload transfers, ZIP manifests) to one session, never the raw value. Empty outside HTTP.
 * $tenant: the active tenant, resolved and membership-checked on the server (Workspace::context); null without tenancy
 * or without a membership, and then every tenant-scoped resource fails closed.
 */
final readonly class Context
{
    public function __construct(public Identity $actor, public string $channel, public Acl $acl, public \PDO $db, public array $scopes = [], public array $uploads = [], public string $owner = '', public ?string $tenant = null) {}
}
