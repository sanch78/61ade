<?php

declare(strict_types=1);

require dirname(__DIR__, 2).'/examples/demo-app/vendor/autoload.php';
putenv('VAPA_TEST_AUTH_RUNTIME='.(getenv('VAPA_TMP_DIR') ?: dirname(__DIR__, 2).'/codex/tmp').'/auth-contract');
require dirname(__DIR__).'/fixtures/authentication/setup.php';

use Vapa\Authentication\LoginSecurity;
use Vapa\Authentication\RememberedLogins;
use Vapa\Feature\Context;
use Vapa\Feature\Failure;
use Vapa\Mail\Delivery;
use Vapa\Mail\LoginMessage;

function verify(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function denied(Closure $work, string $message, ?int $status = null): void
{
    try {
        $work();
    } catch (Failure $failure) {
        verify($status === null || $failure->status === $status, $message.' status');
        return;
    }
    throw new RuntimeException($message);
}

$app = require dirname(__DIR__).'/fixtures/authentication/application.php';
$workspace = $app->workspace;
$db = $workspace->db;
$delivery = new class implements Delivery {
    public array $last = [];
    public function send(string $recipient, string $subject, string $html, string $text): void
    {
        $this->last = compact('recipient', 'subject', 'html', 'text');
    }
    public function code(): string
    {
        preg_match('/\b([0-9]{6})\b/', $this->last['text'], $matches);
        return $matches[1];
    }
};
$security = new LoginSecurity($workspace, $app->identities, $delivery, new LoginMessage('Synthetic app', ['heading' => 'Custom heading'], static fn() => ['intro' => 'Business-specific text.']), $app->runtime, 'email');
$actor = $app->identities->find('1');
verify($security->needsConfirmation($actor), 'All accounts default to email confirmation');
verify($security->needsConfirmation($app->identities->find('2')), 'Missing preference is enabled');
$pending = $security->begin($actor, true, 'synthetic-browser');
$code = $delivery->code();
verify(str_contains($delivery->last['html'], '<table') && str_contains($delivery->last['html'], 'Custom heading') && str_contains($delivery->last['text'], 'Business-specific text.'), 'Formatted email and business text overrides');
verify(!str_contains(json_encode($db->query('SELECT * FROM vapa_login_challenges')->fetchAll(PDO::FETCH_ASSOC)), $code), 'No plaintext code in database');
denied(static fn() => $security->confirm($pending['id'], $code, 'another-browser'), 'Challenge bound to browser', 401);
denied(static fn() => $security->confirm($pending['id'], '000000', 'synthetic-browser'), 'Wrong code rejected', 401);
verify((int) $db->query('SELECT attempts FROM vapa_login_challenges')->fetchColumn() === 1, 'Failed attempt survives rejection');
$result = $security->confirm($pending['id'], $code, 'synthetic-browser');
verify($result['identity']->id === '1' && $result['remember'], 'Correct code completes remembered login proof');
denied(static fn() => $security->confirm($pending['id'], $code, 'synthetic-browser'), 'Code is single use', 401);
denied(static fn() => $security->begin($actor, false, 'synthetic-browser', true), 'Resend is rate limited', 429);

$expired = $security->begin($actor, false, 'expired-browser');
$db->prepare('UPDATE vapa_login_challenges SET expires_at = ? WHERE id = ?')->execute([time() - 1, $expired['id']]);
denied(static fn() => $security->confirm($expired['id'], $delivery->code(), 'expired-browser'), 'Expired code denied', 401);
$revoked = $security->begin($actor, false, 'revoked-browser');
$workspace->revokeSessions('1');
denied(static fn() => $security->confirm($revoked['id'], $delivery->code(), 'revoked-browser'), 'Password/version change invalidates pending code', 401);

$other = $app->identities->find('2');
$limited = $security->begin($other, false, 'limited-browser');
$correct = $delivery->code();
for ($i = 0; $i < 5; $i++) denied(static fn() => $security->confirm($limited['id'], '000000', 'limited-browser'), 'Failed code limit', 401);
denied(static fn() => $security->confirm($limited['id'], $correct, 'limited-browser'), 'Five failures block even correct code', 429);

$remembered = new RememberedLogins($db);
$credential = $remembered->issue('1', $workspace->version('1'), 90);
verify(abs($credential['expires'] - time() - 90 * 86400) <= 1, '90 day expiry');
verify(!str_contains(json_encode($db->query('SELECT * FROM vapa_remembered_logins')->fetchAll(PDO::FETCH_ASSOC)), explode('.', $credential['cookie'])[1]), 'Remember secret stored only as hash');
$restored = $remembered->restore($credential['cookie'], $app->identities, $workspace);
verify($restored['identity']->id === '1' && $restored['cookie'] !== $credential['cookie'] && $restored['expires'] === $credential['expires'], 'Restore rotates secret without extending expiry');
verify($remembered->restore($credential['cookie'], $app->identities, $workspace) === null, 'Old credential replay rejected');
verify($remembered->restore($restored['cookie'], $app->identities, $workspace) === null, 'Replayed token family revoked');
$credential = $remembered->issue('1', $workspace->version('1'), 90);
$workspace->revokeSessions('1');
verify($remembered->restore($credential['cookie'], $app->identities, $workspace) === null, 'Credential change invalidates remembered login');
$credential = $remembered->issue('3', 0, 90);
verify($remembered->restore($credential['cookie'], $app->identities, $workspace) === null, 'Disabled accounts cannot restore');
$credential = $remembered->issue('1', $workspace->version('1'), 90);
$db->exec('UPDATE vapa_remembered_logins SET expires_at = 1');
verify($remembered->restore($credential['cookie'], $app->identities, $workspace) === null, 'Server expiry enforced');

$context = new Context($actor, 'ui', $workspace->acl, $db);
$workspace->executor->execute($context, 'members', 'security', '2', ['email_confirmation' => '0']);
verify(!$security->needsConfirmation($other), 'Per-user switch off');
verify($security->needsConfirmation($actor), 'Other user stays enabled');
$workspace->executor->execute($context, 'members', 'security', '2', ['email_confirmation' => '1']);
verify($security->needsConfirmation($other), 'Per-user switch on');
denied(static fn() => $workspace->executor->execute(new Context($other, 'ui', $workspace->acl, $db), 'members', 'security', '1', ['email_confirmation' => '0']), 'Settings action enforces ACL', 403);
$logs = json_encode($db->query('SELECT * FROM vapa_audit')->fetchAll(PDO::FETCH_ASSOC));
verify(!str_contains($logs, $code) && !str_contains($logs, $credential['cookie']) && !str_contains($logs, 'demo-password-123'), 'Authentication audit contains no secrets');
echo "VAPA email confirmation, settings and 90-day remembered login contracts passed.\n";
