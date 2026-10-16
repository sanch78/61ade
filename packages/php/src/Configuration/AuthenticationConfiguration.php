<?php

declare(strict_types=1);

namespace Vapa\Configuration;

use Vapa\Authentication\LoginSecurity;
use Vapa\Feature\Workspace;
use Vapa\Mail\LoginMessage;
use Vapa\Mail\SmtpDelivery;
use Vapa\Shell\IdentityProvider;

final class AuthenticationConfiguration
{
    public static function build(array $definition, array $callbacks, string $title, string $runtime, Workspace $workspace, IdentityProvider $identities): LoginSecurity
    {
        Shape::check($definition, ['email_attribute' => 'string', 'mail' => 'array'], [
            'remember_days' => 'integer', 'code_lifetime_seconds' => 'integer', 'default_email_confirmation' => 'boolean',
        ], '$.authentication');
        $mail = $definition['mail'];
        Shape::check($mail, ['dsn' => 'string', 'from_address' => 'string', 'from_name' => 'string'], [
            'texts' => 'array', 'text_overrides_binding' => 'string',
        ], '$.authentication.mail');
        $bindings = new Bindings($callbacks);
        return new LoginSecurity(
            workspace: $workspace,
            identities: $identities,
            delivery: new SmtpDelivery($mail['dsn'], $mail['from_address'], $mail['from_name']),
            message: new LoginMessage($title, $mail['texts'] ?? [], $bindings->get($mail['text_overrides_binding'] ?? null)),
            runtime: $runtime,
            emailAttribute: $definition['email_attribute'],
            rememberDays: $definition['remember_days'] ?? 90,
            codeLifetime: $definition['code_lifetime_seconds'] ?? 600,
            defaultEmailConfirmation: $definition['default_email_confirmation'] ?? true,
        );
    }
}
