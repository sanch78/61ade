<?php
declare(strict_types=1);
namespace Blade\Feature;
use Blade\I18n\Translator;

/** Aggregation of the UsageProviders registered for one resource (delete previews and their clearing). */
final class Usages
{
    /**
     * Counts over $ids, summed per label in provider order; zero counts are left out; labels translated.
     * @param list<UsageProvider> $providers
     * @return list<array{label:string,count:int}>
     */
    public static function count(Context $ctx, array $providers, array $ids): array
    {
        $ids = array_values(array_unique(array_map('strval', $ids)));
        $totals = [];
        if ($ids) foreach ($providers as $provider) {
            $result = $provider->usages($ctx, $ids);
            foreach ($ids as $id) foreach ($result[$id] ?? [] as $usage) {
                if (!is_array($usage) || !is_string($usage['label'] ?? null) || $usage['label'] === '' || !is_int($usage['count'] ?? null) || $usage['count'] < 0) throw new \LogicException('Invalid usage report.');
                if ($usage['count'] > 0) $totals[$usage['label']] = ($totals[$usage['label']] ?? 0) + $usage['count'];
            }
        }
        return array_map(static fn($label, $count) => ['label' => Translator::text($label), 'count' => $count], array_keys($totals), $totals);
    }

    /** Calls every provider's clear(); returns the translated label => count map of $usages (the counts before clearing). */
    public static function clear(Context $ctx, array $providers, array $ids, string $policy, array $usages): array
    {
        $ids = array_values(array_unique(array_map('strval', $ids)));
        if ($ids) foreach ($providers as $provider) $provider->clear($ctx, $ids, $policy);
        return array_column($usages, 'count', 'label');
    }
}
