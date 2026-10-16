<?php
declare(strict_types=1);
namespace Vapa\Navigation;

use Vapa\Shell\Identity;

final readonly class Menu
{
    /** @param list<MenuItem> $items */
    public function __construct(public array $items)
    {
        $ids = [];
        $validate = function (array $items) use (&$validate, &$ids): void {
            foreach ($items as $item) {
                if (!$item instanceof MenuItem || isset($ids[$item->id])) {
                    throw new \InvalidArgumentException('Menu items must have unique IDs.');
                }
                $ids[$item->id] = true;
                $validate($item->items);
            }
        };
        $validate($items);
    }

    public function project(Identity $actor): array
    {
        return array_values(array_filter(array_map(static fn(MenuItem $item) => $item->project($actor), $this->items)));
    }
}
