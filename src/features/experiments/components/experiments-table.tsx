'use client';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { useExperiments } from '@/lib/firestore/queries/experiments';
import type { ExperimentStatus } from '@/types/experiments';

const statusColor: Record<ExperimentStatus, string> = {
  planned: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  running: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 animate-pulse',
  completed: 'bg-green-500/10 text-green-700 dark:text-green-400',
  failed: 'bg-red-500/10 text-red-700 dark:text-red-400',
  cancelled: 'bg-muted text-muted-foreground'
};

function formatDate(ms: number | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('vi-VN');
}

export function ExperimentsTable() {
  const { experiments, loading } = useExperiments();
  const locale = useLocale();

  if (loading) {
    return <div className='text-muted-foreground py-8 text-center text-sm'>Đang tải...</div>;
  }

  if (experiments.length === 0) {
    return (
      <div className='text-muted-foreground py-12 text-center text-sm'>
        Chưa có experiment nào. Click &quot;Thêm mới&quot; để bắt đầu.
      </div>
    );
  }

  return (
    <div className='rounded-lg border overflow-x-auto'>
      <table className='w-full text-sm'>
        <thead className='bg-muted/50 text-xs uppercase'>
          <tr>
            <th className='px-3 py-2 text-left'>Mã</th>
            <th className='px-3 py-2 text-left'>Tiêu đề</th>
            <th className='px-3 py-2 text-left'>Loại</th>
            <th className='px-3 py-2 text-left'>Trạng thái</th>
            <th className='px-3 py-2 text-left'>Bắt đầu</th>
          </tr>
        </thead>
        <tbody>
          {experiments.map((e) => (
            <tr key={e.id} className='border-t hover:bg-muted/30'>
              <td className='px-3 py-2 font-mono text-xs'>
                <Link href={`/${locale}/dashboard/experiments/${e.id}`} className='hover:underline'>
                  {e.experimentCode}
                </Link>
              </td>
              <td className='px-3 py-2 font-medium'>{e.title}</td>
              <td className='px-3 py-2 capitalize'>{e.experimentType}</td>
              <td className='px-3 py-2'>
                <Badge className={statusColor[e.status]} variant='secondary'>
                  {e.status}
                </Badge>
              </td>
              <td className='px-3 py-2 text-muted-foreground'>{formatDate(e.startedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
