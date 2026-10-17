<?php
declare(strict_types=1);
namespace Vapa\Feature;
use Vapa\I18n\Translator;
final class Failure extends \RuntimeException
{
    public readonly array $fieldErrors;
    public function __construct(string $message, public readonly int $status = 400, array $fieldErrors = []) {
        $this->fieldErrors = array_map(Translator::text(...), $fieldErrors);
        parent::__construct(Translator::text($message));
    }
}
