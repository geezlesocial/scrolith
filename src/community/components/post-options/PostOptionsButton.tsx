import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

import PostOptionsBottomSheet from './PostOptionsBottomSheet';
import PostOptionsMenu from './PostOptionsMenu';
import PostSaveCollectionDialog from './PostSaveCollectionDialog';
import { usePostOptions } from './usePostOptions';

const useIsMobile = (breakpointPx = 900) => {
  const [isMobile, setIsMobile] = useState(() => {
    try {
      return window.innerWidth < breakpointPx;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpointPx);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpointPx]);

  return isMobile;
};

export default function PostOptionsButton({
  post,
  menuTitle,
  icon,
  buttonClassName,
  onHideFromFeed,
  onEditPost,
  onDeletePost,
  onTogglePin,
  onToggleHighlight
}: {
  post: any;
  menuTitle?: string;
  icon?: React.ReactNode;
  buttonClassName?: string;
  onHideFromFeed?: (postId: string) => void;
  onEditPost?: (post: any) => void;
  onDeletePost?: (post: any) => void;
  onTogglePin?: (post: any) => void;
  onToggleHighlight?: (post: any) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const isMobile = useIsMobile(900);
  const [open, setOpen] = useState(false);
  const [saveCollectionOpen, setSaveCollectionOpen] = useState(false);

  const { items, saved, setSaved } = usePostOptions({
    post,
    isOpen: open,
    onHideFromFeed,
    onEditPost,
    onDeletePost,
    onTogglePin,
    onToggleHighlight,
    onOpenSaveCollectionPicker: () => {
      setOpen(false);
      setSaveCollectionOpen(true);
    }
  });

  const resolvedTitle = useMemo(() => menuTitle || 'Post options', [menuTitle]);

  useEffect(() => {
    if (!open) return;
    const onRouteChange = () => setOpen(false);
    window.addEventListener('popstate', onRouteChange);
    return () => window.removeEventListener('popstate', onRouteChange);
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={
          `inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 ${buttonClassName || ''}`
        }
        aria-label="Post options"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        {icon || <MoreHorizontal className="h-4 w-4" />}
      </button>

      {isMobile ? (
        <PostOptionsBottomSheet
          open={open}
          title={resolvedTitle}
          items={items}
          onClose={() => setOpen(false)}
        />
      ) : (
        <PostOptionsMenu open={open} anchorEl={buttonRef.current} items={items} onClose={() => setOpen(false)} />
      )}

      <PostSaveCollectionDialog
        open={saveCollectionOpen}
        postId={String(post?.id || '').trim()}
        postTitle={String(post?.title || post?.content || '').slice(0, 80)}
        saved={saved}
        onSavedChange={(next) => setSaved(next)}
        onClose={() => setSaveCollectionOpen(false)}
      />
    </>
  );
}
