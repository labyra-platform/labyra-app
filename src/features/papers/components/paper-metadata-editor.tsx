'use client';

/**
 * PaperMetadataEditor (R237bl) — confirm/fix a paper's bibliographic metadata.
 *
 * Solves the "Untitled" / mis-read-title problem: after upload the worker's
 * best-effort extraction can miss or misread (e.g. "Phage" → "Please"), so the
 * user gets a quick form to correct title / authors / year / DOI. "Resolve from
 * DOI" pulls the authoritative record from Crossref/OpenAlex (/api/papers/
 * resolve-doi) and fills the fields; Save PATCHes /api/papers/[id].
 *
 * Controlled (open / onOpenChange) so the list can drive it from a row button
 * or the kebab. Uses shadcn Sheet + Input/Textarea.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { getFirebaseAuth } from '@/lib/firebase/client';
import type { Paper } from '@/types/papers';

const DOI_RE = /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i;

async function authHeader(): Promise<{ Authorization: string }> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('not_authenticated');
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

export function PaperMetadataEditor({
  paper,
  open,
  onOpenChange
}: {
  paper: Paper | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [year, setYear] = useState('');
  const [doi, setDoi] = useState('');
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);

  // Re-seed fields whenever a new paper is opened.
  useEffect(() => {
    if (!paper) return;
    setTitle(paper.title && paper.title !== 'Untitled' ? paper.title : '');
    setAuthors((paper.authors ?? []).join('\n'));
    setYear(paper.year ? String(paper.year) : '');
    setDoi(paper.doi ?? '');
  }, [paper]);

  const resolveFromDoi = async () => {
    const d = doi.trim().replace(/^https?:\/\/doi\.org\//i, '');
    if (!DOI_RE.test(d)) {
      toast.error('DOI không hợp lệ', { description: 'Định dạng: 10.xxxx/yyyy' });
      return;
    }
    setResolving(true);
    try {
      const res = await fetch('/api/papers/resolve-doi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ doi: d })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.found) {
        toast.error('Không tìm thấy DOI', { description: 'Crossref/OpenAlex không có bản ghi.' });
        return;
      }
      if (data.title) setTitle(data.title);
      if (Array.isArray(data.authors) && data.authors.length) setAuthors(data.authors.join('\n'));
      if (data.year) setYear(String(data.year));
      setDoi(data.doi || d);
      toast.success(
        data.isRetracted ? '⚠️ Đã điền — bài này BỊ RÚT (retracted)' : 'Đã điền từ DOI',
        { description: data.journal || undefined }
      );
    } catch (e) {
      toast.error('Lỗi tra DOI', { description: e instanceof Error ? e.message : 'unknown' });
    } finally {
      setResolving(false);
    }
  };

  const save = async () => {
    if (!paper) return;
    const t = title.trim();
    if (!t) {
      toast.error('Tiêu đề không được trống');
      return;
    }
    const d = doi.trim().replace(/^https?:\/\/doi\.org\//i, '');
    if (d && !DOI_RE.test(d)) {
      toast.error('DOI không hợp lệ', { description: 'Để trống hoặc nhập đúng 10.xxxx/yyyy' });
      return;
    }
    const yNum = year.trim() ? Number.parseInt(year.trim(), 10) : undefined;
    const patch: Record<string, unknown> = {
      title: t,
      authors: authors
        .split(/[\n;]+/)
        .map((a) => a.trim())
        .filter(Boolean),
      ...(yNum && yNum >= 1800 && yNum <= 2100 ? { year: yNum } : {}),
      ...(d ? { doi: d } : {})
    };
    setSaving(true);
    try {
      const res = await fetch(`/api/papers/${paper.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-change-note': 'manual metadata confirm',
          ...(await authHeader())
        },
        body: JSON.stringify(patch)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Đã lưu thông tin');
      onOpenChange(false);
    } catch (e) {
      toast.error('Lưu thất bại', { description: e instanceof Error ? e.message : 'unknown' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='flex w-full flex-col gap-0 p-0 sm:max-w-[440px]'>
        <SheetHeader className='border-b px-5 py-4'>
          <SheetTitle>Xác nhận thông tin bài báo</SheetTitle>
          <SheetDescription>
            Sửa hoặc điền tiêu đề, tác giả, năm, DOI. Có thể tự điền từ DOI.
          </SheetDescription>
        </SheetHeader>

        <div className='flex-1 space-y-4 overflow-y-auto px-5 py-4'>
          <div className='space-y-1.5'>
            <Label htmlFor='pm-doi'>DOI</Label>
            <div className='flex gap-2'>
              <Input
                id='pm-doi'
                value={doi}
                onChange={(e) => setDoi(e.target.value)}
                placeholder='10.1021/jacs.0c01234'
                className='font-mono text-sm'
              />
              <Button
                type='button'
                variant='secondary'
                onClick={() => void resolveFromDoi()}
                disabled={resolving || !doi.trim()}
                className='shrink-0 gap-1'
              >
                {resolving ? (
                  <Icons.spinner className='size-4 animate-spin' />
                ) : (
                  <Icons.refresh className='size-4' />
                )}
                Lấy từ DOI
              </Button>
            </div>
            <p className='text-xs text-muted-foreground'>
              Tra Crossref → OpenAlex và điền tiêu đề/tác giả/năm chuẩn.
            </p>
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='pm-title'>Tiêu đề</Label>
            <Textarea
              id='pm-title'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              rows={2}
              placeholder='Tiêu đề đầy đủ của bài báo'
            />
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='pm-authors'>Tác giả</Label>
            <Textarea
              id='pm-authors'
              value={authors}
              onChange={(e) => setAuthors(e.target.value)}
              rows={4}
              placeholder={'Mỗi tác giả 1 dòng\nNguyen Van A\nTran Thi B'}
            />
            <p className='text-xs text-muted-foreground'>Mỗi tác giả một dòng.</p>
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='pm-year'>Năm</Label>
            <Input
              id='pm-year'
              value={year}
              onChange={(e) => setYear(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
              inputMode='numeric'
              placeholder='2024'
              className='w-28'
            />
          </div>
        </div>

        <SheetFooter className='flex-row justify-end gap-2 border-t px-5 py-4'>
          <Button variant='ghost' onClick={() => onOpenChange(false)} disabled={saving}>
            Huỷ
          </Button>
          <Button onClick={() => void save()} disabled={saving} className='gap-1'>
            {saving && <Icons.spinner className='size-4 animate-spin' />}
            Lưu
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
