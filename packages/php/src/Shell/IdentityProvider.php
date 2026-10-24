<?php
declare(strict_types=1);
namespace Blade\Shell;

interface IdentityProvider
{
    public function authenticate(string $username, #[\SensitiveParameter] string $password): ?Identity;
    /** Recheck account availability and permissions on every authenticated request. */
    public function find(string $id): ?Identity;
}
