import type { HTMLAttributes, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

export function TableContainer(props: HTMLAttributes<HTMLDivElement>) {
  return <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white" {...props} />;
}

export function Table({ className = "", ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={`min-w-full divide-y divide-slate-200 text-sm ${className}`} {...props} />;
}

export function Th({ className = "", ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`whitespace-nowrap bg-slate-50 px-4 py-3 text-left text-xs font-semibold tracking-wide text-slate-600 ${className}`}
      {...props}
    />
  );
}

export function Td({ className = "", ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={`px-4 py-3 align-top text-slate-700 ${className}`} {...props} />;
}
