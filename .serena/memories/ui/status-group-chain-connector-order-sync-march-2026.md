## GroupCard: з’єднувач ланцюга груп і reorder

**Проблема:** Між картками рендерився `flex justify-center py-1` з вертикальною лінією, якщо `!isLast && group.nextGroupId`. Після оптимістичного зміни **лише `order`** `nextGroupId` лишався старим → лінія з’являлась між не тими групами або «порожнім» способом.

**Виправлення:** Показувати з’єднувач лише коли `group.nextGroupId === nextSiblingGroupId`, де `nextSiblingGroupId` — id наступної групи в **відсортованому** списку (`sortedGroups[idx+1]`). Проп `isLast` прибрано з `GroupCard`.

Файл: `statuses-management.tsx`.