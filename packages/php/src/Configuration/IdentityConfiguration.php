<?php

declare(strict_types=1);

namespace Vapa\Configuration;

use PDO;
use Vapa\Shell\SqlIdentityProvider;

final class IdentityConfiguration
{
    public static function build(PDO $db, array $definition, array $callbacks): SqlIdentityProvider
    {
        Shape::check($definition, [
            'table' => 'string',
            'id_column' => 'string',
            'username_column' => 'string',
            'password_column' => 'string',
            'name_column' => 'string',
        ], [
            'attribute_columns' => 'array',
            'allowed' => 'string',
            'password_verifier' => 'string',
        ], '$.identity');
        $bindings = new Bindings($callbacks);
        return new SqlIdentityProvider(
            db: $db,
            table: $definition['table'],
            idColumn: $definition['id_column'],
            usernameColumn: $definition['username_column'],
            passwordColumn: $definition['password_column'],
            nameColumn: $definition['name_column'],
            attributeColumns: $definition['attribute_columns'] ?? [],
            allowed: $bindings->get($definition['allowed'] ?? null),
            passwordVerifier: $bindings->get($definition['password_verifier'] ?? null),
        );
    }
}
