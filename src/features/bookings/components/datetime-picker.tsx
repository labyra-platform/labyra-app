'use client';

/**
 * DateTimePicker — shadcn Calendar (date) + native time input (HH:MM).
 * Stores/returns epoch ms. Renders local time; conversion to UTC happens
 * implicitly via Date. Clean replacement for <input type=datetime-local>.
 *
 * @phase BOOK-2
 */
import { IconCalendar } from '@tabler/icons-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function DateTimePicker({
  value,
  onChange
}: {
  value: number | undefined;
  onChange: (ms: number) => void;
}) {
  const date = value ? new Date(value) : undefined;
  const timeStr = date
    ? `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    : '09:00';

  function setDate(d: Date | undefined) {
    if (!d) return;
    const base = value ? new Date(value) : new Date();
    d.setHours(base.getHours(), base.getMinutes(), 0, 0);
    onChange(d.getTime());
  }

  function setTime(s: string) {
    const [h, m] = s.split(':').map(Number);
    const base = value ? new Date(value) : new Date();
    base.setHours(h || 0, m || 0, 0, 0);
    onChange(base.getTime());
  }

  return (
    <div className='flex gap-2'>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type='button'
            variant='outline'
            className='flex-1 justify-start text-left font-normal'
          >
            <IconCalendar className='mr-2 size-4' />
            {date ? format(date, 'PP') : 'Pick a date'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-auto p-0' align='start'>
          <Calendar mode='single' selected={date} onSelect={setDate} />
        </PopoverContent>
      </Popover>
      <Input
        type='time'
        value={timeStr}
        onChange={(e) => setTime(e.target.value)}
        className='w-[110px]'
      />
    </div>
  );
}
