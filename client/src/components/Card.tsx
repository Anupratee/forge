import type { ReactNode } from 'react';

/** The surface every panel sits on, so spacing and borders are decided once. */
export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  /** Usually a link or a button — "View all", "New habit". */
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
      <div>
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        {description !== undefined && (
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        )}
      </div>
      {action}
    </header>
  );
}

export function CardBody({
  className = '',
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}

/** Page title block, so every screen introduces itself the same way. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{title}</h1>
        {description !== undefined && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        )}
      </div>
      {action}
    </header>
  );
}

/** A single headline number for a dashboard. */
export function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-50">{value}</p>
      {detail !== undefined && (
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
      )}
    </div>
  );
}
