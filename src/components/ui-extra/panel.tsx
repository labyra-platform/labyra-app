'use client';

/**
 * Panel — the card primitive the design rules ask for (§12).
 *
 * The rules exist to remove a choice, not to be remembered. Everything they
 * fix about shadcn's Card is fixed here once, so no caller has to know:
 *
 *   §1  p-5 / gap-3 / py-2.5 — outer padding beats inner gap (20:12:8), so a
 *       card reads as one group. shadcn's default is gap-6 inside py-6: equal
 *       values, no hierarchy, and py-6 leaves zero horizontal padding, which
 *       is why text sat flush against the border.
 *   §1  rows are separated by divide-y, not gap — a hairline separates better
 *       than whitespace and costs 0px.
 *   §4  border OR shadow. Border, and never both.
 *   §10 <section aria-labelledby> + <h2>, so a screen reader sees a landmark
 *       instead of the `Role: generic, Name: (empty)` every card reports today.
 *       The id is generated, so a11y can't be forgotten at the call site.
 *
 * Composition is deliberately narrow: Panel → PanelHeader / PanelList /
 * PanelRow / PanelFooter. If a layout needs a value that isn't here, that's a
 * conversation about the rules, not a className.
 */
import { useId } from 'react';
import type React from 'react';
import { cn } from '@/lib/utils';

export function Panel({
  title,
  action,
  count,
  children,
  className
}: {
  /** Renders the §10 heading and names the landmark. */
  title: string;
  /** Trailing header slot — a link, a picker, a legend. */
  action?: React.ReactNode;
  /** Convenience for the common "N items" trailing count. */
  count?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn(
        'border-border bg-card flex h-full flex-col gap-3 rounded-xl border p-5',
        className
      )}
    >
      <div className='flex items-baseline justify-between gap-2'>
        <h2 id={id} className='text-heading truncate font-medium'>
          {title}
        </h2>
        {action ??
          (count != null && (
            <span className='text-muted-foreground text-caption shrink-0 tabular-nums'>
              {count}
            </span>
          ))}
      </div>
      {children}
    </section>
  );
}

/** Header slot for panels that need more than a title + count. */
export function PanelHeaderExtra({ children }: { children: React.ReactNode }) {
  return <div className='flex items-center gap-2'>{children}</div>;
}

export function PanelList({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <ul className={cn('divide-border divide-y', className)}>{children}</ul>;
}

export function PanelRow({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <li className={cn('flex items-center gap-2 py-2.5', className)}>{children}</li>;
}

/** Sticks to the bottom so panels in a row end on the same line (§7). */
export function PanelFooter({ children }: { children: React.ReactNode }) {
  return <div className='mt-auto pt-1'>{children}</div>;
}

/**
 * Empty state as an invitation, not an apology (§7).
 *
 * Day one for every self-serve customer is an empty dashboard — that is the
 * first impression, so it gets a headline that names the space and a CTA that
 * is a verb. It also fills the height when a taller sibling stretches the
 * card, which is what the rules mean by not leaving 100px of void.
 */
export function PanelEmpty({
  title,
  description,
  action
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className='flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center'>
      <p className='text-body font-medium'>{title}</p>
      {description && <p className='text-muted-foreground text-caption max-w-xs'>{description}</p>}
      {action}
    </div>
  );
}
