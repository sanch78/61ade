<?php
declare(strict_types=1);
namespace Blade\Feature;
use Blade\I18n\Translator;
final class Failure extends \RuntimeException
{
    public readonly array $fieldErrors;
    /** $details: structured, non-sensitive data for the client (e.g. a conflict's current revision). */
    public function __construct(string $message, public readonly int $status = 400, array $fieldErrors = [], public readonly array $details = []) {
        $this->fieldErrors = array_map(Translator::text(...), $fieldErrors);
        parent::__construct(Translator::text($message));
    }
}
