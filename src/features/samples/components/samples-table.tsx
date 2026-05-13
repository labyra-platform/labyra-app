'use client';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { useSamples } from '@/lib/firestore/queries/samples';
import type { SampleStatus } from '@/types/samples';

const statusColor: Record<SampleStatus, string> = {
  prepared: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  in_use: 'bg-green-500/10 text-green-700 dark:text-green-400',
  consumed: 'bg-muted text-muted-foreground',
  archived: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
  discarded: 'bg-red-500/10 text-red-700 dark:text-red-400'
};

export function SamplesTable() {
  const { samples, loading } = useSamples();
  const locale = useLocale();

  if (loading) {
    return <div className='text-muted-foreground py-8 text-center text-sm'>Đang tải...</div>;
  }

  if (samples.length === 0) {
    return (
      <div className='text-muted-foreground py-12 text-center text-sm'>
        Chưa có sample nào. Click &quot;Thêm mới&quot; để bắt đầu.
      </div>
    );
  }

  return (
    <div className='rounded-lg border overflow-x-auto'>
      <table className='w-full text-sm'>
        <thead className='bg-muted/50 text-xs uppercase'>
          <tr>
            <th className='px-3 py-2 text-left'>Mã sample</th>
            <th className='px-3 py-2 text-left'>Tên</th>
            <th className='px-3 py-2 text-right'>Khối lượng / Thể tích</th>
            <th className='px-3 py-2 text-left'>Trạng thái</th>
            <th className='px-3 py-2 text-left'>Vị trí</th>
          </tr>
        </thead>
        <tbody>
          {samples.map((s) => (
            <tr key={s.id} className='border-t hover:bg-muted/30'>
              <td className='px-3 py-2 font-mono text-xs'>
                <Link href={`/${locale}/dashboard/samples/${s.id}`} className='hover:underline'>
                  {s.sampleCode}
                </Link>
              </td>
              <td className='px-3 py-2 font-medium'>{s.name}</td>
              <td className='px-3 py-2 text-right tabular-nums'>
                {s.mass != null ? `${s.mass} g` : s.volume != null ? `${s.volume} mL` : '—'}
              </td>
              <td className='px-3 py-2'>
                <Badge className={statusColor[s.status]} variant='secondary'>
                  {s.status}
                </Badge>
              </td>
              <td className='px-3 py-2 text-muted-foreground'>{s.location ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
