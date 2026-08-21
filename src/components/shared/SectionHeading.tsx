import { ChevronRight } from 'lucide-react';

interface SectionHeadingProps {
  title: string;
  onViewAll?: () => void;
}

export function SectionHeading({ title, onViewAll }: SectionHeadingProps) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
      {onViewAll && (
        <button
          onClick={onViewAll}
          className="flex items-center gap-1 text-xs font-semibold text-lime-300 transition hover:text-lime-200"
        >
          Ver todos <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
