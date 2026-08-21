import { useState, useMemo } from 'react';
import { Search, Layers } from 'lucide-react';

interface GroupSidebarProps {
  groups: string[];
  activeGroup: string | null;
  onSelectGroup: (group: string | null) => void;
  channelCounts: Map<string, number>;
  totalCount: number;
}

export function GroupSidebar({ groups, activeGroup, onSelectGroup, channelCounts, totalCount }: GroupSidebarProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.toLowerCase().includes(q));
  }, [groups, query]);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar categoria…"
          className="w-full rounded-xl bg-white/5 border border-white/10 py-2 pl-8 pr-3 text-xs text-white placeholder-white/30 outline-none focus:border-white/25 transition-colors"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-1 scrollbar-thin">
        <button
          onClick={() => onSelectGroup(null)}
          className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium transition-colors ${
            activeGroup === null
              ? 'bg-lime-300/15 text-lime-300 border border-lime-300/20'
              : 'text-white/60 hover:bg-white/5 hover:text-white border border-transparent'
          }`}
        >
          <Layers className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 truncate">Todos</span>
          <span className="text-[10px] tabular-nums text-white/30">{totalCount}</span>
        </button>

        {filtered.map((g) => (
          <button
            key={g}
            onClick={() => onSelectGroup(g)}
            className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium transition-colors ${
              activeGroup === g
                ? 'bg-lime-300/15 text-lime-300 border border-lime-300/20'
                : 'text-white/60 hover:bg-white/5 hover:text-white border border-transparent'
            }`}
          >
            <span className="flex-1 truncate">{g}</span>
            <span className="text-[10px] tabular-nums text-white/30">{channelCounts.get(g) ?? 0}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
