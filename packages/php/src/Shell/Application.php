<?php

declare(strict_types=1);

namespace Vapa\Shell;

use Vapa\Authentication\PasswordAttempts;
use Vapa\Feature\Failure;
use Vapa\I18n\Translator;

/** Framework-owned session, password, email confirmation and remembered-device flow. */
final class Application
{
    public function __construct(private ApplicationDefinition $definition)
    {
    }

    public function run(): void
    {
        $this->headers();
        $this->startSession();
        $settings = $this->definition->languages;
        $requested = $_COOKIE[$this->definition->sessionName.'_language'] ?? null;
        if (isset($_SERVER['HTTP_AUTHORIZATION'])) $requested = $_SERVER['HTTP_X_VAPA_LOCALE'] ?? $requested;
        Translator::configure($settings, is_string($requested) ? $requested : null);
        header('Content-Language: '.Translator::locale());
        $workspace = $this->definition->workspace;
        $identity = $this->currentIdentity();
        $error = '';
        $username = '';

        if (isset($_GET['vapa'])) {
            if (!$workspace) {
                http_response_code(404);
                return;
            }
            $workspace->http($identity, $this->definition->identities, $_SESSION['csrf'], $this->definition->runtime);
        }
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            try {
                $token = $_POST['csrf'] ?? null;
                if (!is_string($token) || !hash_equals($_SESSION['csrf'], $token)) {
                    $workspace?->journal->record($identity?->id ?? '', 'ui', 'session', 'csrf', '', 'rejected');
                    throw new Failure('A munkamenet lejárt. Kérjük, próbáld újra.', 403);
                }
                $action = $_POST['action'] ?? '';
                if ($action === 'language') {
                    $locale = $_POST['locale'] ?? null;
                    if (!$settings->selector || !is_string($locale) || !isset($settings->languages[$locale])) throw new Failure('Ismeretlen nyelv.');
                    setcookie($this->definition->sessionName.'_language', $locale, ['expires'=>time()+31536000,'path'=>$this->definition->cookiePath,'secure'=>$this->secure(),'httponly'=>true,'samesite'=>'Lax']);
                    $this->redirect();
                } elseif ($action === 'logout') {
                    $this->logout($identity);
                } elseif ($action === 'login' && !$identity) {
                    $username = is_string($_POST['username'] ?? null) ? trim($_POST['username']) : '';
                    $this->login($username);
                } elseif (!$identity && in_array($action, ['confirm_login', 'resend_login', 'cancel_login'], true)) {
                    $this->confirmation($action);
                } elseif (!$identity && in_array($action, ['change_password', 'cancel_password_change'], true)) {
                    $this->passwordChange($action);
                } else {
                    throw new Failure('Ismeretlen művelet.');
                }
            } catch (Failure $failure) {
                http_response_code($failure->status);
                if ($failure->status === 429) header('Retry-After: 60');
                $error = $failure->getMessage();
            }
        }

        $definition = $this->definition;
        $csrf = $_SESSION['csrf'];
        $escape = static fn(string $text): string => htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $bootstrap = [
            'protocol' => 1,
            'i18n' => ['locale'=>Translator::locale(),'languages'=>$settings->languages,'flags'=>$settings->flags,'selector'=>$settings->selector && count($settings->languages)>1,'messages'=>Translator::messages()],
            'title' => Translator::text($definition->title),
            'version' => $definition->version,
            'authenticated' => $identity !== null,
            'username' => $username,
            'error' => $error,
            'rememberAvailable' => $definition->authentication !== null,
            'rememberDays' => $definition->authentication?->rememberDays,
            'loginIdentifier' => $definition->accounts ? 'email' : 'username',
        ];
        if (!$identity && isset($_SESSION['pendingPasswordChange'])) {
            $bootstrap['passwordChange'] = ['expires' => $_SESSION['pendingPasswordChange']['expires']];
        }
        if (!$identity && isset($_SESSION['pendingLogin'])) {
            $pending = $_SESSION['pendingLogin'];
            $bootstrap['confirmation'] = ['email' => $pending['email'], 'expires' => $pending['expires']];
        }
        if ($identity) {
            $bootstrap['userId'] = $identity->id;
            $bootstrap['displayName'] = $identity->displayName;
            $bootstrap['menu'] = $definition->menu->project($identity);
            if ($workspace) {
                $bootstrap['views'] = $workspace->views($identity);
                $bootstrap['csrf'] = $csrf;
                $bootstrap['live'] = $definition->live->metadata();
            }
        }
        session_write_close();
        require dirname(__DIR__, 2).'/templates/shell.php';
    }

    private function headers(): void
    {
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: same-origin');
        $liveSource = $this->definition->live->connectSource();
        header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' $liveSource; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    }

    private function startSession(): void
    {
        $runtime = $this->definition->runtime;
        foreach ([$runtime, $runtime.'/sessions', $runtime.'/login'] as $directory) {
            if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
                throw new \RuntimeException('Cannot create private runtime storage.');
            }
        }
        session_name($this->definition->sessionName);
        session_save_path($runtime.'/sessions');
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => $this->definition->cookiePath,
            'secure' => $this->secure(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
        if (isset($_SESSION['lastSeen']) && time() - $_SESSION['lastSeen'] > 1800) {
            $_SESSION = [];
            session_regenerate_id(true);
        }
        $_SESSION['lastSeen'] = time();
        $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
    }

    private function currentIdentity(): ?Identity
    {
        $workspace = $this->definition->workspace;
        $actor = isset($_SESSION['identity']) ? $this->definition->identities->find($_SESSION['identity']) : null;
        if ($actor && $workspace && ($_SESSION['credentialVersion'] ?? 0) !== $workspace->version($actor->id)) {
            $actor = null;
        }
        if ($actor && $this->definition->authentication && !($_SESSION['loginSecurityEnabled'] ?? false)) {
            $actor = null;
        }
        if (!$actor) {
            unset($_SESSION['identity']);
            $security = $this->definition->authentication;
            $cookie = $_COOKIE[$this->rememberCookieName()] ?? '';
            if ($security && is_string($cookie) && $cookie !== '') {
                $restored = $security->remembered->restore($cookie, $this->definition->identities, $workspace);
                if ($restored) {
                    $actor = $restored['identity'];
                    $this->establishSession($actor, $restored['credentialVersion']);
                    $this->rememberCookie($restored['cookie'], $restored['expires']);
                } else {
                    $workspace?->journal->record('', 'ui', 'session', 'remember_restore', '', 'rejected');
                    $this->rememberCookie('', time() - 3600);
                }
            }
        }
        return $actor;
    }

    private function login(string $username): never
    {
        $workspace = $this->definition->workspace;
        $password = is_string($_POST['password'] ?? null) ? $_POST['password'] : '';
        try {
            $actor = PasswordAttempts::authenticate(
                $this->definition->runtime,
                $_SERVER['REMOTE_ADDR'] ?? '',
                $this->definition->identities,
                $username,
                $password,
            );
        } catch (Failure $error) {
            $workspace?->journal->record('', 'ui', 'session', 'login', '', 'rejected');
            throw $error;
        }
        if (!$actor) {
            $workspace?->journal->record('', 'ui', 'session', 'login', '', 'rejected');
            throw new Failure('Hibás felhasználónév vagy jelszó, illetve nem elérhető fiók.', 401);
        }
        $security = $this->definition->authentication;
        $remember = ($_POST['remember'] ?? '') === '1';
        if ($security && $security->needsConfirmation($actor)) {
            $binding = bin2hex(random_bytes(32));
            $pending = $security->begin($actor, $remember, $binding);
            $_SESSION = ['csrf' => bin2hex(random_bytes(32)), 'lastSeen' => time(), 'loginBinding' => $binding, 'pendingLogin' => $pending];
            session_regenerate_id(true);
            $this->redirect();
        }
        $this->finishLogin($actor, $remember);
    }

    private function confirmation(string $action): never
    {
        $security = $this->definition->authentication;
        $pending = $_SESSION['pendingLogin'] ?? null;
        $binding = $_SESSION['loginBinding'] ?? '';
        if (!$security || !is_array($pending) || !is_string($binding)) {
            throw new Failure('Nincs megerősítésre váró belépés.', 401);
        }
        if ($action === 'cancel_login') {
            $security->cancel($pending['id'], $binding);
            $this->definition->workspace?->journal->record($pending['actor_id'], 'ui', 'authentication', 'email_cancel', '', 'success');
            unset($_SESSION['pendingLogin'], $_SESSION['loginBinding']);
            $this->redirect();
        }
        if ($action === 'resend_login') {
            $actor = $this->definition->identities->find($pending['actor_id']);
            if (!$actor || $pending['expires'] <= time()) {
                throw new Failure('A belépési kísérlet lejárt. Kezdd újra a bejelentkezést.', 401);
            }
            $_SESSION['pendingLogin'] = $security->begin($actor, $pending['remember'], $binding, true);
            $this->redirect();
        }
        $code = is_string($_POST['code'] ?? null) ? $_POST['code'] : '';
        $result = $security->confirm($pending['id'], $code, $binding);
        $this->finishLogin($result['identity'], $result['remember'], $result['credentialVersion']);
    }

    private function passwordChange(string $action): never
    {
        $pending = $_SESSION['pendingPasswordChange'] ?? null;
        $accounts = $this->definition->accounts;
        if (!$accounts || !is_array($pending)) throw new Failure('Nincs folyamatban lévő jelszócsere.', 401);
        if ($action === 'cancel_password_change' || $pending['expires'] <= time()) {
            unset($_SESSION['pendingPasswordChange']);
            if ($action !== 'cancel_password_change') throw new Failure('A jelszócsere ideje lejárt. Jelentkezz be újra.', 401);
            $this->redirect();
        }
        $actor = $this->definition->identities->find($pending['actor_id']);
        if (!$actor) {
            unset($_SESSION['pendingPasswordChange']);
            throw new Failure('A fiók nem érhető el.', 401);
        }
        $accounts->completeForcedChange(
            $actor->id,
            is_string($_POST['new_password'] ?? null) ? $_POST['new_password'] : '',
            is_string($_POST['confirm_password'] ?? null) ? $_POST['confirm_password'] : '',
        );
        $this->finishLogin($actor, $pending['remember']);
    }

    private function finishLogin(Identity $actor, bool $remember, ?int $verifiedVersion = null): never
    {
        if ($this->definition->accounts?->mustChangePassword($actor->id)) {
            // No session, menu, API or remembered login until the temporary password is replaced.
            $_SESSION = ['csrf' => bin2hex(random_bytes(32)), 'lastSeen' => time(), 'pendingPasswordChange' => ['actor_id' => $actor->id, 'remember' => $remember, 'expires' => time() + 600]];
            session_regenerate_id(true);
            $this->redirect();
        }
        $this->establishSession($actor, $verifiedVersion);
        $workspace = $this->definition->workspace;
        $workspace?->journal->record($actor->id, 'ui', 'session', 'login', '', 'success');
        $security = $this->definition->authentication;
        if ($security) {
            $old = $_COOKIE[$this->rememberCookieName()] ?? '';
            if (is_string($old)) $security->remembered->revoke($old);
            if ($remember) {
                $credential = $security->remembered->issue($actor->id, $_SESSION['credentialVersion'], $security->rememberDays);
                $this->rememberCookie($credential['cookie'], $credential['expires']);
            } else {
                $this->rememberCookie('', time() - 3600);
            }
        }
        $this->redirect();
    }

    private function establishSession(Identity $actor, ?int $verifiedVersion = null): void
    {
        $_SESSION = [
            'identity' => $actor->id,
            'csrf' => bin2hex(random_bytes(32)),
            'lastSeen' => time(),
            'credentialVersion' => $verifiedVersion ?? $this->definition->workspace?->version($actor->id) ?? 0,
            'loginSecurityEnabled' => $this->definition->authentication !== null,
        ];
        session_regenerate_id(true);
    }

    private function logout(?Identity $actor): never
    {
        $security = $this->definition->authentication;
        $cookie = $_COOKIE[$this->rememberCookieName()] ?? '';
        if ($security && is_string($cookie)) {
            $security->remembered->revoke($cookie);
            $this->rememberCookie('', time() - 3600);
        }
        $pending = $_SESSION['pendingLogin'] ?? null;
        if ($security && is_array($pending)) {
            $security->cancel($pending['id'], $_SESSION['loginBinding'] ?? '');
        }
        $this->definition->workspace?->journal->record($actor?->id ?? '', 'ui', 'session', 'logout', '', 'success');
        $_SESSION = [];
        session_regenerate_id(true);
        $this->redirect();
    }

    private function rememberCookieName(): string
    {
        return $this->definition->sessionName.'_remember';
    }

    private function secure(): bool
    {
        return isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    }

    private function rememberCookie(string $value, int $expires): void
    {
        setcookie($this->rememberCookieName(), $value, [
            'expires' => $expires,
            'path' => $this->definition->cookiePath,
            'secure' => $this->secure(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    private function redirect(): never
    {
        header('Location: ./', true, 303);
        exit;
    }
}
