<?php
declare(strict_types=1);
namespace Vapa\Feature;
use Vapa\Shell\Identity;
use Vapa\Access\Acl;
final readonly class Context
{
    public function __construct(public Identity $actor, public string $channel, public Acl $acl, public \PDO $db, public array $scopes = []) {}
}
