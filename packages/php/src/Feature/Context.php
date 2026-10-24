<?php
declare(strict_types=1);
namespace Blade\Feature;
use Blade\Shell\Identity;
use Blade\Access\Acl;
/** $uploads: Upload parts of a multipart request, only for actions that accept them. */
final readonly class Context
{
    public function __construct(public Identity $actor, public string $channel, public Acl $acl, public \PDO $db, public array $scopes = [], public array $uploads = []) {}
}
