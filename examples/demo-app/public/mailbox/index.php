<?php
declare(strict_types=1);

/*
 * Synthetic mailbox of the feature demo: shows what the configured mail command stored
 * instead of sending. It stands in for the recipient's mail client, so it is not a 61de
 * screen (AGENTS.md rule 1 exception: external system test double, demo scope only).
 */

require dirname(__DIR__, 2).'/common.php';
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; frame-src 'self'; frame-ancestors 'none'");
$e = static fn(string $value): string => htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

/** Minimal reader for the framework's own multipart/alternative messages. */
function blade_mailbox_read(string $raw): array
{
    [$head, $body] = array_pad(preg_split("/\r?\n\r?\n/", $raw, 2), 2, '');
    $head = preg_replace("/\r?\n[ \t]+/", ' ', $head);
    $headers = [];
    foreach (preg_split("/\r?\n/", $head) as $line) if (str_contains($line, ':')) {
        [$name, $value] = explode(':', $line, 2);
        $headers[strtolower(trim($name))] = trim($value);
    }
    $parts = ['text/plain' => '', 'text/html' => ''];
    if (preg_match('/boundary="?([^";]+)"?/i', $headers['content-type'] ?? '', $match)) {
        foreach (explode('--'.$match[1], $body) as $part) {
            [$partHead, $content] = array_pad(preg_split("/\r?\n\r?\n/", ltrim($part), 2), 2, '');
            if (!preg_match('~content-type:\s*(text/(?:plain|html))~i', $partHead, $type)) continue;
            if (stripos($partHead, 'quoted-printable') !== false) $content = quoted_printable_decode($content);
            elseif (stripos($partHead, 'base64') !== false) $content = base64_decode($content);
            $parts[strtolower($type[1])] = $content;
        }
    }
    return ['to' => iconv_mime_decode($headers['to'] ?? ''), 'subject' => iconv_mime_decode($headers['subject'] ?? ''), 'date' => $headers['date'] ?? '', ...$parts];
}

$files = glob(blade_demo_runtime('outbox').'/*.eml') ?: [];
rsort($files);
$selected = $_GET['m'] ?? (isset($files[0]) ? basename($files[0], '.eml') : '');
$file = preg_match('/^[0-9.]+-[a-f0-9]{8}$/D', (string) $selected) ? blade_demo_runtime('outbox').'/'.$selected.'.eml' : '';
if (isset($_GET['raw']) && is_file($file)) {
    // Frame content: the formatted HTML part in a sandboxed document without scripts.
    header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox");
    echo blade_mailbox_read((string) file_get_contents($file))['text/html'];
    exit;
}
$list = '';
foreach ($files as $item) {
    $mail = blade_mailbox_read((string) file_get_contents($item));
    $id = basename($item, '.eml');
    $list .= '<a class="'.($id === $selected ? 'on' : '').'" href="?m='.$e($id).'"><strong>'.$e($mail['subject']).'</strong><small>'.$e($mail['to']).' · '.$e($mail['date']).'</small></a>';
}
?><!doctype html>
<html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Demó postafiók</title>
<style>
body{margin:0;font:14px/1.45 system-ui,sans-serif;color:#1f2d3d;background:#f1f3f6;display:flex;min-height:100vh}
nav{width:340px;max-width:40vw;background:#fff;border-right:1px solid #dde3ea;overflow:auto}
header{padding:16px;border-bottom:1px solid #dde3ea}.badge{display:inline-block;padding:2px 8px;border-radius:6px;background:#fff1c2;color:#6b4e00;font-size:12px}
a{display:block;padding:12px 16px;border-bottom:1px solid #eef1f5;color:inherit;text-decoration:none}a.on{background:#e8f0fc}small{display:block;color:#5b6b80}
iframe{flex:1;border:0;background:#fff;min-height:100vh}p.empty{padding:16px;color:#5b6b80}
</style></head><body>
<nav><header><span class="badge">Szimulált postafiók — nem 61de-felület</span><h1 style="font-size:18px;margin:8px 0 0">Demó postafiók</h1>
<small>A demó levelet nem küld: a konfigurált parancs ide menti az üzeneteket.</small></header>
<?= $list ?: '<p class="empty">Még nincs levél. Lépj be a twofactor@example.test fiókkal.</p>' ?></nav>
<?php if (is_file($file)): ?><iframe title="Levél" sandbox src="?m=<?= $e((string) $selected) ?>&amp;raw=1"></iframe><?php endif; ?>
</body></html>
