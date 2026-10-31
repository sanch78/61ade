<?php
declare(strict_types=1);
namespace Blade\Feature;
final readonly class Action
{
    /**
     * Resolver returns backend target ['id','owner',...] before permission evaluation; an optional
     * 'acl_id' separates the ACL object from the audited object, 'audit' adds non-sensitive IDs.
     * $upload: multipart transport limit in bytes, or an UploadPolicy (direct multipart up to maxSizeBytes × maxFiles
     * plus the chunked transfer protocol `__upload`); null keeps the action JSON-only.
     * $get: field-free read that is also served over GET/HEAD (e.g. an <img> or <video> source).
     */
    public function __construct(public string $resource, public string $name, public string $label, public array $fields, public \Closure $handler, public ?\Closure $resolve = null, public bool $write = false, public bool $collection = false, public array $channels = ['ui','api'], public ?ListSource $listSource = null, public ?\Closure $formValues = null, public ?\Closure $editHandler = null, public ?string $icon = null, public bool $bulk = false, public ?array $confirm = null, public int|UploadPolicy|null $upload = null, public bool $get = false)
    {
        if ($confirm !== null) self::checkConfirm($confirm);
        if ($upload !== null && ((is_int($upload) && $upload < 1) || $bulk || $collection)) throw new \InvalidArgumentException('Invalid upload action.');
        if ($get && ($write || $upload !== null || $bulk || $collection || $fields)) throw new \InvalidArgumentException('GET actions must be field-free reads.');
        if ($icon !== null && !preg_match('/^[a-zA-Z0-9_ -]{1,150}$/D', $icon)) throw new \InvalidArgumentException('Invalid action icon classes.');
        if ($bulk && ($name === 'create' || !$resolve || $collection || array_filter($fields, static fn($field) => $field->secret || $field->type === 'password'))) throw new \InvalidArgumentException('Bulk actions must target individual objects without secret inputs.');
        foreach ([$resource,$name] as $id) if (!preg_match('/^[a-z][a-z0-9_.-]*$/D',$id)) throw new \InvalidArgumentException('Invalid action');
        foreach ($fields as $field) if (!$field instanceof Field) throw new \InvalidArgumentException('Invalid field');
        // A condition names another field of the record; one the action carries must not be conditional itself.
        $known = array_column($fields, null, 'name');
        foreach ($fields as $field) if ($field->visibleWhen !== null && ($known[$field->visibleWhen['field']] ?? null)?->visibleWhen !== null) throw new \InvalidArgumentException('A field condition cannot depend on a conditional field.');
    }

    /** Browser-visible confirmation prompt shown before the action runs. Plain text only. */
    private static function checkConfirm(array $confirm): array
    {
        $allowed = ['message' => 1, 'title' => 1, 'severity' => 1, 'confirm_label' => 1, 'cancel_label' => 1];
        if (array_diff_key($confirm, $allowed) || !isset($confirm['message']) || !is_string($confirm['message']) || $confirm['message'] === '') throw new \InvalidArgumentException('Invalid action confirmation.');
        foreach (['title', 'confirm_label', 'cancel_label'] as $key) if (isset($confirm[$key]) && !is_string($confirm[$key])) throw new \InvalidArgumentException('Invalid action confirmation.');
        if (isset($confirm['severity']) && !in_array($confirm['severity'], ['neutral', 'warning', 'danger'], true)) throw new \InvalidArgumentException('Invalid action confirmation severity.');
        return $confirm;
    }
}
