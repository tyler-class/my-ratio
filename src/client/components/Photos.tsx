import { useRef, useState } from 'react';
import type { ImageRef } from '@shared/types';
import { api, errorMessage, imageUrl, uploadImage } from '../lib/api';
import { prepareImage } from '../lib/image';
import { useActions } from '../lib/queries';
import { useToast } from './Toast';
import { Icon } from './Icon';

/**
 * Photos of a bag, or a roaster's logo (single: a new upload replaces the old one).
 * Files go to R2 under the record's key; the list refreshes from the server afterwards.
 */
export function Photos({
  owner,
  ownerId,
  images,
  single,
}: {
  owner: 'beans' | 'roasters';
  ownerId: string;
  images: ImageRef[];
  single?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { refresh } = useActions();

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files).slice(0, single ? 1 : 10)) {
        const p = await prepareImage(f);
        await uploadImage(`/${owner}/${ownerId}/images`, p.blob, p);
      }
      if (single) for (const old of images) await api.del(`/images/${old.id}`);
      await refresh();
    } catch (e) {
      toast({ text: errorMessage(e), tone: 'bad' });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove(id: string) {
    try {
      await api.del(`/images/${id}`);
      await refresh();
    } catch (e) {
      toast({ text: errorMessage(e), tone: 'bad' });
    }
  }

  return (
    <div className="photos">
      {images.map((img) => (
        <div className="photo" key={img.id}>
          <img
            src={imageUrl(img.id)}
            alt=""
            loading="lazy"
            width={img.width ?? undefined}
            height={img.height ?? undefined}
            style={single ? { height: 96, background: '#fff', objectFit: 'contain' } : undefined}
          />
          <button type="button" aria-label="Remove photo" onClick={() => remove(img.id)}>
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
      {(!single || images.length === 0 || busy) && (
        <button
          type="button"
          className="add-photo"
          style={single ? { height: 96 } : undefined}
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Icon name="camera" size={22} />
          {busy ? 'Uploading…' : single ? 'Add logo' : 'Add photo'}
        </button>
      )}
      {single && images.length > 0 && !busy && (
        <button type="button" className="btn sm" onClick={() => input.current?.click()}>
          Replace
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple={!single}
        hidden
        onChange={(e) => add(e.target.files)}
      />
    </div>
  );
}

export function Thumb({ img, className = 'thumb' }: { img?: ImageRef; className?: string }) {
  if (!img) return null;
  return <img className={className} src={imageUrl(img.id)} alt="" loading="lazy" />;
}
