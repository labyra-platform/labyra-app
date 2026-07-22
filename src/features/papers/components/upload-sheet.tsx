'use client';

/**
 * UploadSheet (R237ap) — right-side Sheet wrapping UploadDropzone so a user can
 * add a paper without leaving the list. Mirrors MaterialFormSheet /
 * BookingFormSheet. The standalone /papers/upload route still exists for direct
 * links and deep navigation.
 *
 * On success it closes the sheet and opens the new paper.
 *
 * R581: an optional collection can be picked before uploading, so a paper lands
 * where it belongs instead of being uploaded and then moved. Membership lives on
 * the collection (paperIds), not on the paper, so filing here changes nothing
 * about "Tất cả tài liệu" — the paper is in the full list either way.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';
import { useCollections } from '@/features/papers/collections/use-collections';
import { useTenantId } from '@/lib/auth/use-claims';
import { addPapersToCollection } from '@/lib/firestore/queries/collections';
import { UploadDropzone } from './upload-dropzone';

/** Sentinel for "don't file this anywhere" — Select cannot hold an empty value. */
const NO_COLLECTION = '__none__';

export function UploadSheet({
  trigger,
  defaultCollectionId = null
}: {
  trigger: ReactNode;
  /**
   * R581: preselect this collection. Set when the upload is started from inside
   * a collection — filing there is almost certainly what was meant, and it is
   * still one click to change or clear.
   */
  defaultCollectionId?: string | null;
}) {
  const t = useTranslations('papers');
  const tc = useTranslations('collections');
  const router = useRouter();
  const locale = useLocale();
  const tenantId = useTenantId();
  const queryClient = useQueryClient();
  const { collections } = useCollections();
  const [open, setOpen] = useState(false);
  const [collectionId, setCollectionId] = useState<string>(defaultCollectionId ?? NO_COLLECTION);
  // R259: while bytes are transferring, ignore dismiss attempts (outside-click /
  // Escape / X) so a stray click can't drop the in-flight upload.
  const [uploading, setUploading] = useState(false);

  const fileUploaded = async (paperIds: string[]) => {
    if (collectionId === NO_COLLECTION || !tenantId || paperIds.length === 0) return;
    const name = collections.find((c) => c.id === collectionId)?.name ?? '';
    try {
      await addPapersToCollection(tenantId, collectionId, paperIds);
      await queryClient.invalidateQueries({
        queryKey: ['tenant-collection', tenantId, 'collections']
      });
      toast.success(tc('addedToast', { name }));
    } catch (e) {
      // Surfaced, not swallowed: the upload succeeded but the filing did not,
      // and a paper silently missing from the collection the user chose is
      // worse than a visible failure they can retry from the list.
      toast.error(tc('addFailed'), { description: e instanceof Error ? e.message : 'unknown' });
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && uploading) return;
        setOpen(next);
        if (!next) setCollectionId(defaultCollectionId ?? NO_COLLECTION);
      }}
    >
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side='right' className='w-full overflow-y-auto sm:max-w-[440px]'>
        <SheetHeader>
          <SheetTitle>{t('uploadPageTitle')}</SheetTitle>
          <SheetDescription>{t('uploadPageSubtitle')}</SheetDescription>
        </SheetHeader>
        <div className='mt-4 space-y-4'>
          {collections.length > 0 && (
            <div className='space-y-2'>
              <Label htmlFor='upload-collection'>{tc('addToCollectionLabel')}</Label>
              <Select value={collectionId} onValueChange={setCollectionId} disabled={uploading}>
                <SelectTrigger id='upload-collection' className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_COLLECTION}>{tc('noCollection')}</SelectItem>
                  {collections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className='text-meta text-muted-foreground'>{tc('addToCollectionHint')}</p>
            </div>
          )}
          <UploadDropzone
            onUploadingChange={setUploading}
            onUploadedAll={fileUploaded}
            onUploaded={(paperId) => {
              setUploading(false);
              setOpen(false);
              router.push(`/${locale}/dashboard/papers/${paperId}`);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
