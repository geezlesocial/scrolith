import React, { useCallback, useRef, useState } from 'react';
import VoiceRecorder from '../../messages/VoiceRecorder';
import { FileService } from '../../services/files';
import { useUser } from '../../context/UserContext';
import {
  formatAttachmentBytes,
  inferUploadCategory,
  isAllowedAttachmentSize,
  MESSAGE_CAMERA_ACCEPT,
  MESSAGE_MEDIA_ACCEPT,
  MESSAGE_UPLOAD_ACCEPT,
  type PendingComposerAttachment
} from '../../services/messagingComposer';
import { getRecoverableActionMessage } from '../../mobile/runtime/requestRecovery';
import SmartComposer from './SmartComposer';
import { X } from 'lucide-react';

type InlineMessageComposerProps = {
  conversationId: string;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void | Promise<void>;
  onTyping?: (isTyping: boolean) => void;
  onVoiceRecorded?: (blob: Blob, durationMs: number) => Promise<void> | void;
  onSuggestReply?: () => Promise<void> | void;
  pendingAttachments?: PendingComposerAttachment[];
  onAttachmentsUploaded?: (files: any[]) => void;
  onRemoveAttachment?: (attachmentId: string) => void;
  replyPreview?: { label: string; text: string } | null;
  onCancelReply?: () => void;
  disabled?: boolean;
  sending?: boolean;
  voiceDisabled?: boolean;
  maxVoiceSeconds?: number;
  suggestLoading?: boolean;
  placeholder?: string;
};

const InlineMessageComposer: React.FC<InlineMessageComposerProps> = ({
  conversationId,
  value,
  onChange,
  onSend,
  onTyping,
  onVoiceRecorded,
  onSuggestReply,
  pendingAttachments = [],
  onAttachmentsUploaded,
  onRemoveAttachment,
  replyPreview = null,
  onCancelReply,
  disabled = false,
  sending = false,
  voiceDisabled = false,
  maxVoiceSeconds = 180,
  suggestLoading = false,
  placeholder = 'Write a message…'
}) => {
  const { user } = useUser();
  const filesInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const sendingLockRef = useRef(false);
  const [uploadState, setUploadState] = useState<{
    fileName: string;
    progress: number;
    uploadedCount: number;
    totalCount: number;
  } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSend = useCallback(async () => {
    if (disabled || sending || sendingLockRef.current || uploadState) return;
    if (!value.trim() && pendingAttachments.length === 0) return;
    sendingLockRef.current = true;
    try {
      await onSend();
    } finally {
      sendingLockRef.current = false;
    }
  }, [disabled, sending, uploadState, value, pendingAttachments.length, onSend]);

  const uploadFiles = useCallback(
    async (fileList: FileList | File[] | null) => {
      if (!user || !onAttachmentsUploaded) return;
      const queue = Array.from(fileList || []).filter(Boolean);
      if (!queue.length) return;
      setLocalError(null);
      for (const file of queue) {
        if (!isAllowedAttachmentSize(file.size)) {
          setLocalError(`“${file.name}” exceeds the maximum attachment size.`);
          return;
        }
      }
      setUploadState({
        fileName: queue[0].name || 'Attachment',
        progress: 0,
        uploadedCount: 0,
        totalCount: queue.length
      });
      const uploaded: any[] = [];
      try {
        for (let index = 0; index < queue.length; index += 1) {
          const file = queue[index];
          const result = await FileService.uploadFile(file, inferUploadCategory(file), {
            role: user.role,
            userId: user.id,
            visibility: 'private',
            onProgress: (progress) => {
              setUploadState({
                fileName: file.name || 'Attachment',
                progress,
                uploadedCount: index,
                totalCount: queue.length
              });
            }
          });
          uploaded.push(result);
          setUploadState({
            fileName: file.name || 'Attachment',
            progress: 100,
            uploadedCount: index + 1,
            totalCount: queue.length
          });
        }
        onAttachmentsUploaded(uploaded);
      } catch (error) {
        setLocalError(getRecoverableActionMessage('Attachment upload', error));
      } finally {
        setUploadState(null);
      }
    },
    [user, onAttachmentsUploaded]
  );

  const busy = disabled || sending || Boolean(uploadState);

  return (
    <div className="border-t border-slate-200 bg-white p-2.5" data-conversation-id={conversationId}>
      {replyPreview ? (
        <div className="mb-2 flex items-start justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50 px-2.5 py-2">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">
              {replyPreview.label}
            </div>
            <div className="truncate text-xs text-slate-700">{replyPreview.text}</div>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-slate-700"
            aria-label="Cancel reply"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {pendingAttachments.length > 0 ? (
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5">
          {pendingAttachments.map((file) => (
            <div
              key={file.id}
              className="flex min-w-[9rem] max-w-[12rem] items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700"
            >
              <div className="min-w-0">
                <div className="truncate font-semibold">{file.name}</div>
                <div className="text-[10px] text-slate-500">
                  {formatAttachmentBytes(file.size) || 'Ready to send'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRemoveAttachment?.(file.id)}
                className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-slate-700"
                aria-label={`Remove ${file.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {uploadState ? (
        <div className="mb-2 rounded-xl border border-blue-100 bg-blue-50 px-2.5 py-2 text-[11px] text-blue-700">
          Uploading {uploadState.fileName} ({uploadState.uploadedCount + 1}/{uploadState.totalCount}){' '}
          {uploadState.progress}%
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-blue-100">
            <div
              className="h-full rounded-full bg-blue-600"
              style={{ width: `${uploadState.progress}%` }}
            />
          </div>
        </div>
      ) : null}

      {localError ? (
        <div className="mb-2 rounded-lg border border-red-100 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
          {localError}
        </div>
      ) : null}

      <SmartComposer
        compact
        value={value}
        onChange={(next) => {
          onChange(next);
          onTyping?.(next.trim().length > 0);
        }}
        onSubmit={() => void handleSend()}
        disabled={busy}
        sending={sending}
        canSend={
          Boolean(value.trim() || pendingAttachments.length) && !uploadState && !sending && !disabled
        }
        placeholder={placeholder}
        onPickFiles={() => filesInputRef.current?.click()}
        onPickMedia={() => mediaInputRef.current?.click()}
        onPickCamera={() => cameraInputRef.current?.click()}
        onSuggestReply={onSuggestReply ? () => void onSuggestReply() : undefined}
        suggestLoading={suggestLoading}
        showSuggestReply={Boolean(onSuggestReply)}
        helperText={
          uploadState
            ? 'Uploading…'
            : pendingAttachments.length
              ? `${pendingAttachments.length} ready`
              : undefined
        }
        fileInputs={
          <>
            <input
              ref={filesInputRef}
              type="file"
              multiple
              accept={MESSAGE_UPLOAD_ACCEPT}
              className="hidden"
              onChange={(event) => {
                void uploadFiles(event.target.files);
                event.target.value = '';
              }}
            />
            <input
              ref={mediaInputRef}
              type="file"
              multiple
              accept={MESSAGE_MEDIA_ACCEPT}
              className="hidden"
              onChange={(event) => {
                void uploadFiles(event.target.files);
                event.target.value = '';
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept={MESSAGE_CAMERA_ACCEPT}
              capture="environment"
              className="hidden"
              onChange={(event) => {
                void uploadFiles(event.target.files);
                event.target.value = '';
              }}
            />
          </>
        }
        voiceControl={
          <VoiceRecorder
            disabled={busy || voiceDisabled}
            maxDurationSeconds={maxVoiceSeconds}
            onRecorded={async (blob, durationMs) => {
              await onVoiceRecorded?.(blob, durationMs);
            }}
            onError={(message) => setLocalError(message)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          />
        }
      />
    </div>
  );
};

export default InlineMessageComposer;
