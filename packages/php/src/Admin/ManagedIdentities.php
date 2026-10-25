<?php

declare(strict_types=1);

namespace Blade\Admin;

use Blade\Shell\Identity;
use Blade\Shell\IdentityProvider;

/** Adds 61de account state to the consumer's identity mapping; both must allow the account. */
final readonly class ManagedIdentities implements IdentityProvider
{
    public function __construct(private IdentityProvider $inner, private Accounts $accounts)
    {
    }

    public function authenticate(string $username, #[\SensitiveParameter] string $password): ?Identity
    {
        $identity = $this->inner->authenticate(mb_strtolower(trim($username)), $password);
        return $identity && $this->accounts->loginAllowed($identity->id) ? $identity : null;
    }

    public function find(string $id): ?Identity
    {
        $identity = $this->inner->find($id);
        return $identity && $this->accounts->available($identity->id) ? $identity : null;
    }
}
