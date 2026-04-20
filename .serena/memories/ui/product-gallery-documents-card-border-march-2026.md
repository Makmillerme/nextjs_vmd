## Галерея та документи на картці товару — рамка

**Дата:** 2026-03-31

**Зміни:** Узгоджено з патерном `FolderSection` у `product-documents-tab.tsx` (`rounded-lg border border-border bg-card shadow-sm`).

1. **`src/features/products/components/product-media-gallery.tsx`** — блок каруселі обгорнуто в `<div className="rounded-lg border border-border bg-card p-2 shadow-sm">`, щоб у sheet була видима рамка навколо галереї / слоту «Додати фото».

2. **`src/features/products/components/product-documents-tab.tsx`** — ті самі утиліти додано до:
   - порожнього стану (немає папок) та «збережіть товар»;
   - прев’ю з папками (`p-3`);
   - обгортки `ManagementListLoading` (`overflow-hidden`);
   - стану помилки (`p-4`);
   - основного списку папок (`p-3`).

**Примітка:** Кожна `FolderSection` як і раніше має власну рамку; зовнішня рамка групує весь вміст табу документів.