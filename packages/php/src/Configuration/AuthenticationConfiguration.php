<?php

declare(strict_types=1);

namespace Blade\Configuration;

use Blade\Authentication\LoginSecurity;
use Blade\Feature\Workspace;
use Blade\Mail\{CommandDelivery, Delivery, Layout, LoginMessage};
use Blade\Shell\IdentityProvider;

final class AuthenticationConfiguration
{
    public static function build(array $definition, array $callbacks, string $title, string $runtime, Workspace $workspace, IdentityProvider $identities): LoginSecurity
    {
        Shape::check($definition, ['email_attribute' => 'string', 'mail' => 'array'], [
            'remember_days' => 'integer', 'code_lifetime_seconds' => 'integer', 'default_email_confirmation' => 'boolean',
        ], '$.authentication');
        $mail = $definition['mail'];
        Shape::check($mail, ['from_address' => 'string', 'from_name' => 'string'], [
            'command' => 'array', 'command_timeout_seconds' => 'integer', 'transport' => 'any', 'dsn' => 'any',
            'texts' => 'array', 'text_overrides_binding' => 'string', 'accent_color' => 'string',
        ], '$.authentication.mail');
        $bindings = new Bindings($callbacks);
        return new LoginSecurity(
            workspace: $workspace,
            identities: $identities,
            delivery: self::delivery($mail, $runtime),
            message: new LoginMessage($title, $mail['texts'] ?? [], $bindings->get($mail['text_overrides_binding'] ?? null), new Layout($mail['accent_color'] ?? '#2f6fd0')),
            runtime: $runtime,
            emailAttribute: $definition['email_attribute'],
            rememberDays: $definition['remember_days'] ?? 90,
            codeLifetime: $definition['code_lifetime_seconds'] ?? 600,
            defaultEmailConfirmation: $definition['default_email_confirmation'] ?? true,
        );
    }

    /** Argument-list command started without a shell; the body file is written inside the runtime directory. */
    public static function delivery(array $mail, string $runtime): Delivery
    {
        if (array_key_exists('transport', $mail) || array_key_exists('dsn', $mail)) {
            throw new \InvalidArgumentException('SMTP mail delivery was removed: drop transport/dsn and configure a command argument list at $.authentication.mail.command.');
        }
        if (!isset($mail['command'])) throw new \InvalidArgumentException('Missing configuration key: $.authentication.mail.command');
        return new CommandDelivery($mail['command'], $mail['from_address'], $mail['from_name'], $runtime, $mail['command_timeout_seconds'] ?? 30);
    }
}
