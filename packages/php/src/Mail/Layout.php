<?php

declare(strict_types=1);

namespace Blade\Mail;

use Blade\I18n\Translator;

/**
 * Shared, mail-client-safe framework layout (tables and inline styles only).
 * Every business text is escaped; applications change texts and the accent colour,
 * never the markup.
 */
final readonly class Layout
{
    public function __construct(private string $accent = '#2f6fd0')
    {
        if (!preg_match('/^#[0-9a-fA-F]{6}$/D', $accent)) throw new \InvalidArgumentException('Mail accent colour must be #rrggbb.');
    }

    /** @param string[] $paragraphs */
    public function render(string $application, string $heading, string $greeting, array $paragraphs, ?array $highlight, string $note, string $footer, string $preheader = ''): array
    {
        $e = static fn(string $value): string => nl2br(htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'));
        $font = "font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
        $body = '';
        foreach ($paragraphs as $paragraph) $body .= '<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#2b3a4e">'.$e($paragraph).'</p>';
        if ($highlight) {
            $body .= '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 20px"><tr><td align="center" style="background:#f2f6fc;border:1px solid #dbe5f4;border-radius:10px;padding:18px 12px">'
                .'<div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#5b6b80;margin-bottom:8px">'.$e($highlight['label']).'</div>'
                .'<div style="font-family:Consolas,Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:'.$this->accent.'">'.$e($highlight['value']).'</div>'
                .'</td></tr></table>';
        }
        if ($note !== '') $body .= '<p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#2b3a4e"><strong>'.$e($note).'</strong></p>';
        $html = '<!doctype html><html lang="'.Translator::locale().'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'.$e($heading).'</title></head>'
            .'<body style="margin:0;padding:0;background:#eef1f6;'.$font.'">'
            .'<div style="display:none;max-height:0;overflow:hidden;opacity:0">'.$e($preheader).'</div>'
            .'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef1f6;padding:32px 12px"><tr><td align="center">'
            .'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(20,40,70,.08)">'
            .'<tr><td style="background:'.$this->accent.';padding:18px 32px;color:#ffffff;font-size:15px;font-weight:600;letter-spacing:.3px">'.$e($application).'</td></tr>'
            .'<tr><td style="padding:32px 32px 12px">'
            .'<h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;color:#14243a">'.$e($heading).'</h1>'
            .'<p style="margin:0 0 16px;font-size:15px;color:#2b3a4e">'.$e($greeting).'</p>'.$body
            .'</td></tr>'
            .'<tr><td style="padding:16px 32px 28px;border-top:1px solid #e6ebf2;font-size:12px;line-height:1.6;color:#6a7a8e">'.$e($footer).'</td></tr>'
            .'</table></td></tr></table></body></html>';
        $text = implode("\n\n", array_filter([
            $application, $heading, $greeting, ...$paragraphs,
            $highlight ? $highlight['label'].': '.$highlight['value'] : null,
            $note !== '' ? $note : null, '—', $footer,
        ], static fn($part) => $part !== null && $part !== ''));
        return ['html' => $html, 'text' => $text];
    }
}
