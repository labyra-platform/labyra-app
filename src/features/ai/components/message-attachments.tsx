'use client';

/**
 * Render image attachments on a user message (ADR-036 R200).
 * - Fresh send: attachment.previewUrl is a blob: URL -> use directly.
 * - Reloaded conversation: only storagePath exists -> fetch signed download URL.
 */
import { useEffect, useState } from 'react';
import { getFirebaseAuth } from '@/lib/firebase/client';
import type { ChatAttachment } from '@/types/ai';

function AttachmentImage({ attachment }: { attachment: ChatAttachment }) {
  const [url, setUrl] = useState<string | null>(attachment.previewUrl ?? null);

  useEffect(() => {
    if (attachment.previewUrl) {
      setUrl(attachment.previewUrl);
      return;
    }
    // reloaded conversation — resolve signed download URL from storagePath
    let cancelled = false;
    (async () => {
      try {
        const user = getFirebaseAuth().currentUser;
        if (!user) return;
        const tok = await user.getIdToken();
        const res = await fetch('/api/chat/attachment-download', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` },
          body: JSON.stringify({ storagePath: attachment.storagePath })
        });
        if (!res.ok) return;
        const { url: signed } = (await res.json()) as { url: string };
        if (!cancelled) setUrl(signed);
      } catch {
        /* leave url null — broken image hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attachment.previewUrl, attachment.storagePath]);

  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={attachment.name} className='max-h-60 rounded-lg border object-contain' />
  );
}

export function MessageAttachments({ attachments }: { attachments: ChatAttachment[] }) {
  if (!attachments.length) return null;
  return (
    <div className='mb-2 flex flex-wrap gap-2'>
      {attachments.map((a) => (
        <AttachmentImage key={a.storagePath} attachment={a} />
      ))}
    </div>
  );
}
