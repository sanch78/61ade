<?php
declare(strict_types=1);
namespace Vapa\Shell;

/** Initial server-rendered shell, independent of a hosting framework or database. */
final class Application
{
    public function __construct(
        private IdentityProvider $identities,
        private \Closure $navigation,
        private array $config,
    ) {}

    public function run(): void
    {
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: same-origin');
        header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
        $runtime = $this->config['runtime'];
        foreach ([$runtime, "$runtime/sessions", "$runtime/login"] as $directory) {
            if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
                throw new \RuntimeException('Cannot create private runtime storage');
            }
        }
        session_name($this->config['sessionName'] ?? 'vapa_session');
        session_save_path("$runtime/sessions");
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        session_set_cookie_params([
            'lifetime' => 0, 'path' => $this->config['cookiePath'] ?? '/',
            'secure' => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
            'httponly' => true, 'samesite' => 'Lax',
        ]);
        session_start();
        if (isset($_SESSION['lastSeen']) && time() - $_SESSION['lastSeen'] > 1800) {
            $_SESSION = [];
            session_regenerate_id(true);
        }
        $_SESSION['lastSeen'] = time();
        $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
        $error = '';
        $username = '';
        $identity = isset($_SESSION['identity']) ? $this->identities->find($_SESSION['identity']) : null;
        if (!$identity) unset($_SESSION['identity']);
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $token = $_POST['csrf'] ?? null;
            if (!is_string($token) || !hash_equals($_SESSION['csrf'], $token)) {
                http_response_code(403);
                $error = 'A munkamenet lejárt. Kérjük, próbáld újra.';
            } elseif (($_POST['action'] ?? '') === 'logout') {
                $_SESSION = [];
                session_regenerate_id(true);
                $this->redirect();
            } elseif (($_POST['action'] ?? '') === 'login' && !$identity) {
                $username = is_string($_POST['username'] ?? null) ? trim($_POST['username']) : '';
                $password = is_string($_POST['password'] ?? null) ? $_POST['password'] : '';
                // A shared IP bucket survives cookie/session resets. No credential data is stored.
                $lock = fopen("$runtime/login/".hash('sha256', $_SERVER['REMOTE_ADDR'] ?? '').'.json', 'c+');
                if (!$lock || !flock($lock, LOCK_EX)) throw new \RuntimeException('Login throttle unavailable');
                $attempts = json_decode(stream_get_contents($lock), true) ?: [];
                $attempts = array_values(array_filter($attempts, static fn($at) => $at > time() - 60));
                if (count($attempts) >= 5) {
                    http_response_code(429);
                    header('Retry-After: 60');
                    $error = 'Túl sok sikertelen próbálkozás. Egy perc múlva próbáld újra.';
                } else {
                    $identity = $username !== '' && strlen($username) <= 64 && $password !== '' && strlen($password) <= 1024
                        ? $this->identities->authenticate($username, $password) : null;
                    if (!$identity) {
                        $attempts[] = time();
                        http_response_code(401);
                        $error = 'Hibás felhasználónév vagy jelszó, illetve nem elérhető fiók.';
                    }
                }
                rewind($lock);
                ftruncate($lock, 0);
                fwrite($lock, json_encode($identity ? [] : $attempts));
                flock($lock, LOCK_UN);
                fclose($lock);
                if ($identity) {
                    $_SESSION = ['identity' => $identity->id, 'csrf' => bin2hex(random_bytes(32)), 'lastSeen' => time()];
                    session_regenerate_id(true);
                    $this->redirect();
                }
            } else {
                http_response_code(400);
                $error = 'Ismeretlen művelet.';
            }
        }
        $config = $this->config;
        $csrf = $_SESSION['csrf'];
        $menu = $identity ? ($this->navigation)($identity) : [];
        $escape = static fn(string $text): string => htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        session_write_close();
        require dirname(__DIR__, 2).'/templates/shell.php';
    }

    private function redirect(): never
    {
        // No caller-controlled redirect destination or Host header is used.
        header('Location: ./', true, 303);
        exit;
    }
}
