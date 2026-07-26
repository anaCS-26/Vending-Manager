import { ArrowDown, ArrowUp } from "lucide-react";

type Props<K extends string> = {
    /** The column this icon labels. */
    columnKey: K;
    /** The table's current sort state. `key: null` means "not sorted yet". */
    sortConfig: { key: K | null; direction: "asc" | "desc" };
};

/**
 * Sort direction indicator for a sortable table header.
 *
 * Renders an invisible spacer on inactive columns (rather than nothing) so the
 * header text doesn't shift when the sort column changes, and fades in on
 * hover via the parent `group`.
 *
 * Lives at module scope on purpose. This was previously redefined inside the
 * render body of WarehouseInventoryTable, MachineInventoryTable and
 * SortableFinancialTable — three byte-identical copies. A component created
 * during render is a brand-new type on every render, so React unmounts and
 * remounts its subtree each time; `react-hooks/static-components` flags it.
 * Generic over the key type so each table keeps its own SortKey union.
 */
export function SortIcon<K extends string>({ columnKey, sortConfig }: Props<K>) {
    if (sortConfig.key !== columnKey) {
        return <span className="w-4 h-4 inline-block ml-1 opacity-0 group-hover:opacity-30 transition-opacity" />;
    }
    return sortConfig.direction === "desc"
        ? <ArrowDown className="w-4 h-4 ml-1 inline-block text-brand-500" />
        : <ArrowUp className="w-4 h-4 ml-1 inline-block text-brand-500" />;
}
