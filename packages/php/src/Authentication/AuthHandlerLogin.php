<?php

declare(strict_types=1);

namespace Blade\Authentication;

use Closure;
use InvalidArgumentException;
use Blade\Admin\Accounts;
use Blade\Feature\Failure;
use Blade\Feature\Workspace;
use Blade\I18n\Translator;
use Blade\Shell\Identity;
use Blade\Shell\IdentityProvider;

/**
 * External (OAuth) sign-in through the standalone _AuthHandler library, used unmodified.
 *
 * AuthHandler runs its own overlay, provider redirect, callback and identity store in a
 * separate, short-lived session. 61ade then reads the e-mail address AuthHandler signed in,
 * ends that session at once, and decides itself: only an existing 61ade account with exactly
 * that address, the OAuth switch on and no disabled state may enter. AuthHandler's own user
 * rows (it creates one for unknown addresses) never grant anything in 61ade.
 */
final class AuthHandlerLogin
{
    /** Request parameters owned by AuthHandler; everything else stays with 61ade. */
    private const ACTIONS = ['provider'];

    private ?Closure $factory;

    /**
     * @param string $module Filesystem directory of the _AuthHandler library (e.g. a symlink).
     * @param string $assets Browser path of its public assets (AuthHandler.js/.css, images/), relative to the page.
     * @param array $providers Hybridauth provider settings by name, e.g. ['Google' => ['keys' => ['id' => …, 'secret' => …]]].
     * @param string $storage SQLite file of AuthHandler's own external identity store (private runtime).
     * @param ?string $siteUrl Absolute application URL ending with "/"; null derives it from the request (development).
     * @param array $texts AuthHandler caption overrides in its own lang.json shape: key => [locale => text].
     */
    public function __construct(
        private string $module,
        public readonly string $assets,
        private array $providers,
        private Accounts $accounts,
        private IdentityProvider $identities,
        private Workspace $workspace,
        private string $storage,
        private ?string $siteUrl = null,
        private array $texts = [],
        ?Closure $factory = null,
    ) {
        if (!$accounts->oauth) throw new InvalidArgumentException('External sign-in requires the account administration with OAuth enabled.');
        if (!preg_match('~^(?:/|(?:\.\./)*)?[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*/?$~D', $assets)) throw new InvalidArgumentException('Invalid AuthHandler asset path.');
        if ($siteUrl !== null && (!filter_var($siteUrl, FILTER_VALIDATE_URL) || !str_ends_with($siteUrl, '/'))) throw new InvalidArgumentException('The site URL must be absolute and end with "/".');
        foreach ($texts as $key => $value) {
            if (!is_string($key) || !is_array($value) || array_filter($value, static fn($text, $locale) => !is_string($locale) || !is_string($text), ARRAY_FILTER_USE_BOTH)) {
                throw new InvalidArgumentException('AuthHandler texts: key => [locale => text].');
            }
        }
        foreach ($providers as $name => $provider) {
            if (!is_string($name) || $name !== ucfirst(strtolower($name)) || !preg_match('/^[A-Z][a-z0-9]{1,31}$/D', $name) || !is_array($provider)) {
                throw new InvalidArgumentException('Provider names follow AuthHandler: one capital letter, then lower case (Google, Facebook).');
            }
        }
        $this->factory = $factory;
        if (!$factory && !is_file($module.'/includes/AuthHandler.php')) throw new InvalidArgumentException('AuthHandler library not found: '.$module);
    }

    /**
     * Providers shown in the AuthHandler overlay (every listed one not switched off), even
     * before their keys are entered; an unconfigured one answers with a notice, see intercept().
     */
    public function providers(): array
    {
        return array_keys(array_filter($this->providers, static fn(array $p): bool => ($p['enabled'] ?? true) !== false));
    }

    /** A provider can start a real sign-in only with its client id and secret (or its own adapter). */
    public function configured(string $name): bool
    {
        $p = $this->providers[$name] ?? null;
        return is_array($p) && in_array($name, $this->providers(), true)
            && (isset($p['adapter']) || (($p['keys']['id'] ?? '') !== '' && ($p['keys']['secret'] ?? '') !== ''));
    }

    public function enabled(): bool
    {
        return $this->providers() !== [];
    }

    /**
     * Runs before the 61ade session starts. Serves the AuthHandler bootstrap script, forwards
     * AuthHandler's own provider requests (redirect, callback), or hands over a completed
     * external sign-in: returns its e-mail address once and ends the AuthHandler session.
     * A provider without keys returns a notice instead of reaching AuthHandler.
     *
     * @return ?array{email?: string, remember?: bool, notice?: string}
     */
    public function intercept(string $sessionName, string $cookiePath, string $title): ?array
    {
        if (!$this->enabled()) return null;
        $session = $sessionName.'_oauth';
        $action = $_GET['ah_action'] ?? $_POST['ah_action'] ?? null;
        if (($_GET['blade_auth'] ?? null) === 'bootstrap') {
            $handler = $this->handler($session, $cookiePath, $title);
            header('Content-Type: text/javascript; charset=utf-8');
            header('Cache-Control: no-store');
            echo $handler->Injector();
            $this->close($session, $cookiePath, false);
            exit;
        }
        if ($action !== null) {
            if (!in_array($action, self::ACTIONS, true)) {
                http_response_code(404);
                exit;
            }
            $provider = ucfirst(strtolower(substr((string) ($_GET['provider'] ?? ''), 0, 32)));
            $step = 'oauth_'.(isset($_GET['callback']) ? 'callback' : 'start');
            if (!$this->configured($provider)) {
                $this->workspace->journal->record('', 'ui', 'authentication', $step, $provider, 'rejected');
                return ['notice' => Translator::text('A(z) {provider} belépés még nincs beállítva (hiányzó kulcs).', ['provider' => $provider])];
            }
            $this->workspace->journal->record('', 'ui', 'authentication', $step, $provider, 'success');
            // AuthHandler redirects to the provider, or back to the application after the callback.
            $this->handler($session, $cookiePath, $title)->HandleRequest();
            exit;
        }
        if (!isset($_COOKIE[$session])) return null;
        $handler = $this->handler($session, $cookiePath, $title);
        $email = $handler->IsLoggedIn() ? ($handler->userData['email'] ?? null) : null;
        $this->close($session, $cookiePath, true);
        if (!is_string($email) || $email === '') return null;
        return ['email' => mb_strtolower(trim($email)), 'remember' => ($_GET['blade_remember'] ?? '') === '1'];
    }

    /** 61ade decision after AuthHandler proved the address; one generic refusal (no enumeration). */
    public function admit(string $email): Identity
    {
        $actor = filter_var($email, FILTER_VALIDATE_EMAIL) ? $this->accounts->actorByEmail($email) : null;
        $identity = $actor !== null && $this->accounts->oauthAllowed($actor) ? $this->identities->find($actor) : null;
        if (!$identity) {
            $this->workspace->journal->record('', 'ui', 'authentication', 'oauth_login', '', 'rejected');
            throw new Failure('Ezzel a fiókkal nem engedélyezett a külső belépés.', 403);
        }
        $this->workspace->journal->record($identity->id, 'ui', 'authentication', 'oauth_login', '', 'success');
        return $identity;
    }

    private function handler(string $session, string $cookiePath, string $title): object
    {
        if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
        $base = $this->siteUrl ?? $this->requestUrl();
        $locale = Translator::locale();
        $providers = [];
        foreach ($this->providers as $name => $provider) {
            $providers[$name] = [...$provider, 'enabled' => in_array($name, $this->providers(), true), 'callback' => $base.'?ah_action=provider&provider='.$name.'&callback=1'];
        }
        $config = [
            'debug' => false, 'js_object' => 'authHandler', 'site_name' => Translator::text($title),
            'site_url' => $base, 'site_script' => '', 'module_path' => rtrim($this->assets, '/').'/',
            'lang' => $locale, 'lang_code' => $locale,
            'auto_session' => true, 'session_name' => $session, 'session_cookie_path' => $cookiePath,
            'session_expiry_timeout_secs' => 600, 'allow_persistent_login' => false,
            'allow_registration' => false, 'provider_only_auth' => true, 'providers_on_registration' => false,
            'auto_request_handler' => false, 'auto_init' => true, 'mode' => 'modal',
            'on_ready' => [], 'on_login' => ['window.location.reload();'], 'on_logout' => ['window.location.reload();'],
            'sql_config' => ['driver' => 'sqlite', 'dbname' => $this->storage, 'table' => 'ah_users'],
            'hybridauth_config' => ['providers' => $providers],
            'lang_data' => $this->texts,
        ];
        if ($this->factory) {
            $handler = ($this->factory)($config);
        } else {
            require_once $this->module.'/includes/AuthHandler.php';
            $handler = new \AuthHandler($config);
        }
        return $handler;
    }

    /** Ends the AuthHandler session; after a hand-over nothing of it survives. */
    private function close(string $session, string $cookiePath, bool $destroy): void
    {
        if (session_status() !== PHP_SESSION_ACTIVE) return;
        if ($destroy) {
            $_SESSION = [];
            session_destroy();
            setcookie($session, '', ['expires' => time() - 3600, 'path' => $cookiePath, 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
        } else {
            session_write_close();
        }
    }

    private function requestUrl(): string
    {
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        if (!preg_match('/^[A-Za-z0-9.\-]+(?::\d{1,5})?$/D', $host)) throw new Failure('Érvénytelen kérés.', 400);
        $path = (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
        return 'https://'.$host.substr($path, 0, strrpos($path, '/') + 1);
    }
}
