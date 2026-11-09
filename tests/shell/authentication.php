<?php

declare(strict_types=1);

require dirname(__DIR__, 2).'/examples/demo-app/vendor/autoload.php';
putenv('BLADE_TEST_AUTH_RUNTIME='.(getenv('BLADE_TMP_DIR') ?: dirname(__DIR__, 2).'/tmp').'/auth-contract');
require dirname(__DIR__).'/fixtures/authentication/setup.php';

use Blade\Authentication\LoginSecurity;
use Blade\Authentication\RememberedLogins;
use Blade\Feature\Context;
use Blade\Feature\Failure;
use Blade\Mail\Delivery;
use Blade\Mail\LoginMessage;

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
verify(!str_contains(json_encode($db->query('SELECT * FROM blade_login_challenges')->fetchAll(PDO::FETCH_ASSOC)), $code), 'No plaintext code in database');
denied(static fn() => $security->confirm($pending['id'], $code, 'another-browser'), 'Challenge bound to browser', 401);
denied(static fn() => $security->confirm($pending['id'], '000000', 'synthetic-browser'), 'Wrong code rejected', 401);
verify((int) $db->query('SELECT attempts FROM blade_login_challenges')->fetchColumn() === 1, 'Failed attempt survives rejection');
$result = $security->confirm($pending['id'], $code, 'synthetic-browser');
verify($result['identity']->id === '1' && $result['remember'], 'Correct code completes remembered login proof');
denied(static fn() => $security->confirm($pending['id'], $code, 'synthetic-browser'), 'Code is single use', 401);
denied(static fn() => $security->begin($actor, false, 'synthetic-browser', true), 'Resend is rate limited', 429);

$expired = $security->begin($actor, false, 'expired-browser');
$db->prepare('UPDATE blade_login_challenges SET expires_at = ? WHERE id = ?')->execute([time() - 1, $expired['id']]);
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
verify(!str_contains(json_encode($db->query('SELECT * FROM blade_remembered_logins')->fetchAll(PDO::FETCH_ASSOC)), explode('.', $credential['cookie'])[1]), 'Remember secret stored only as hash');
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
$db->exec('UPDATE blade_remembered_logins SET expires_at = 1');
verify($remembered->restore($credential['cookie'], $app->identities, $workspace) === null, 'Server expiry enforced');

$context = new Context($actor, 'ui', $workspace->acl, $db);
$workspace->executor->execute($context, 'members', 'security', '2', ['email_confirmation' => '0']);
verify(!$security->needsConfirmation($other), 'Per-user switch off');
verify($security->needsConfirmation($actor), 'Other user stays enabled');
$workspace->executor->execute($context, 'members', 'security', '2', ['email_confirmation' => '1']);
verify($security->needsConfirmation($other), 'Per-user switch on');
denied(static fn() => $workspace->executor->execute(new Context($other, 'ui', $workspace->acl, $db), 'members', 'security', '1', ['email_confirmation' => '0']), 'Settings action enforces ACL', 403);
$logs = json_encode($db->query('SELECT * FROM blade_audit')->fetchAll(PDO::FETCH_ASSOC));
verify(!str_contains($logs, $code) && !str_contains($logs, $credential['cookie']) && !str_contains($logs, 'demo-password-123'), 'Authentication audit contains no secrets');

// Shell requests, each in its own process (fixtures/authentication/request.php): cookie SameSite and the opt-in
// client-address binding (docs/authentication.md#cookie-samesite, docs/authentication.md#client-address-binding).
$workspace->executor->execute($context, 'members', 'security', '2', ['email_confirmation' => '0']);
$request = static function (array $options, string $address, array $cookies = [], array $post = []): array {
    $process = proc_open([PHP_BINARY, dirname(__DIR__).'/fixtures/authentication/request.php'], [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']], $pipes);
    fwrite($pipes[0], json_encode(['options' => $options, 'server' => ['REMOTE_ADDR' => $address, ...($post ? ['REQUEST_METHOD' => 'POST'] : [])], 'cookies' => $cookies, 'post' => $post], JSON_THROW_ON_ERROR));
    fclose($pipes[0]);
    [$output, $errors] = [stream_get_contents($pipes[1]), stream_get_contents($pipes[2])];
    if (proc_close($process) !== 0 || $errors !== '') throw new RuntimeException('Shell request failed: '.$errors);
    return json_decode($output, true, flags: JSON_THROW_ON_ERROR);
};
$cookie = static fn(array $response, string $name): ?array => array_values(array_filter($response['cookies'], static fn(array $c) => $c['name'] === $name))[0] ?? null;
$jar = static fn(array $response, ?array $remember = null): array => [$response['session']['name'] => $response['session']['id'], ...($remember ? [$remember['name'] => $remember['value']] : [])];
// Password sign-in of account 2 (no e-mail code) with remember, from $address.
$signIn = static function (array $options, string $address) use ($request, $jar): array {
    $page = $request($options, $address);
    return $request($options, $address, $jar($page), ['action' => 'login', 'csrf' => $page['data']['csrf'], 'username' => 'other', 'password' => 'demo-password-123', 'remember' => '1']);
};
$events = static fn(): array => $db->query("SELECT actor_id, outcome, object_id, field_names, detail FROM blade_audit WHERE resource = 'session' AND action = 'client_address' ORDER BY id")->fetchAll(PDO::FETCH_NUM);

// Defaults: Lax session and remember cookies, no stored address, the session survives an address change.
$login = $signIn([], '198.51.100.7');
$remember = $cookie($login, 'blade_auth_test_remember');
verify($login['data']['identity'] === '2' && $login['session']['samesite'] === 'Lax' && $login['session']['httponly'] && $login['session']['secure'], 'Default session cookie: Lax, HttpOnly, Secure');
verify($remember['value'] !== '' && $remember['samesite'] === 'Lax' && $remember['httponly'] && $remember['secure'] && $remember['path'] === '/', 'Default remember cookie: Lax, HttpOnly, Secure');
verify(!array_key_exists('clientAddress', $login['data']), 'No client address stored by default');
$moved = $request([], '203.0.113.9', $jar($login));
verify(($moved['data']['identity'] ?? null) === '2' && $moved['session']['id'] === $login['session']['id'] && $events() === [], 'Without binding the session survives an address change');
$language = $request([], '203.0.113.9', $jar($login), ['action' => 'language', 'locale' => 'hu', 'csrf' => $moved['data']['csrf']]);
verify($cookie($language, 'blade_auth_test_language')['samesite'] === 'Lax', 'Default language cookie: Lax');

// Strict and bound: both credentials Strict, the language preference stays Lax.
$strict = ['sameSite' => 'Strict', 'bindSessionToClientAddress' => true];
$login = $signIn($strict, '198.51.100.7');
$remember = $cookie($login, 'blade_auth_test_remember');
verify($login['session']['samesite'] === 'Strict' && $remember['samesite'] === 'Strict' && $remember['value'] !== '', 'Strict session and remember cookies');
verify($login['data']['identity'] === '2' && $login['data']['clientAddress'] === '198.51.100.7', 'Sign-in stores the client address');
$same = $request($strict, '198.51.100.7', $jar($login));
verify(($same['data']['identity'] ?? null) === '2' && $same['session']['id'] === $login['session']['id'], 'Bound session kept at the same address');
$language = $request($strict, '198.51.100.7', $jar($login), ['action' => 'language', 'locale' => 'hu', 'csrf' => $same['data']['csrf']]);
verify($cookie($language, 'blade_auth_test_language')['samesite'] === 'Lax', 'Language cookie stays Lax under Strict');
// Another address: the session is cleared and rotated, its file (and so its live ticket) is gone, the event audited.
$ticket = Blade\Live\Tickets::issue($app->runtime, $login['session']['id']);
$moved = $request($strict, '203.0.113.9', $jar($login));
verify(!isset($moved['data']['identity']) && $moved['session']['id'] !== $login['session']['id'] && !is_file($app->runtime.'/sessions/sess_'.$login['session']['id']), 'Bound session ends on an address change');
verify($events() === [['2', 'rejected', '', '[]', '{}']], 'Address change audited with the account id only, no addresses');
denied(static fn() => Blade\Live\Tickets::session($app->runtime, $ticket), 'Live ticket of the ended session refused', 401);
// With the remember cookie the sign-in is restored at the new address, with a rotated credential.
$login = $signIn($strict, '198.51.100.7');
$remember = $cookie($login, 'blade_auth_test_remember');
$restored = $request($strict, '203.0.113.9', $jar($login, $remember));
$rotated = $cookie($restored, 'blade_auth_test_remember');
verify(($restored['data']['identity'] ?? null) === '2' && $restored['data']['clientAddress'] === '203.0.113.9' && $restored['session']['id'] !== $login['session']['id'], 'Remembered login restores the session at the new address');
verify($rotated['value'] !== '' && $rotated['value'] !== $remember['value'] && $rotated['samesite'] === 'Strict' && count($events()) === 2, 'Restore rotates the Strict remember cookie after the audited address change');
// A signed-in session without a stored address (binding enabled later) ends once.
$login = $signIn([], '198.51.100.7');
$bound = $request(['bindSessionToClientAddress' => true], '198.51.100.7', $jar($login));
verify(!isset($bound['data']['identity']) && count($events()) === 3, 'Enabling the binding ends unbound sessions');
echo "61ade email confirmation, settings, 90-day remembered login and session cookie/binding contracts passed.\n";
