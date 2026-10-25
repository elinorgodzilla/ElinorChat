import { memo, useRef, useEffect, useCallback } from 'react';
import { useRecoilState } from 'recoil';
import { Wand2, X, CornerDownRight } from 'lucide-react';
import { TextareaAutosize, TooltipAnchor } from '@librechat/client';
import { cn, removeFocusRings } from '~/utils';
import store from '~/store';

interface PrefillToggleButtonProps {
  conversationId: string;
  disabled?: boolean;
}

export const PrefillToggleButton = memo(function PrefillToggleButton({
  conversationId,
  disabled = false,
}: PrefillToggleButtonProps) {
  const [showPrefill, setShowPrefill] = useRecoilState(
    store.showPrefillInputByConvoId(conversationId),
  );
  const [prefillText] = useRecoilState(store.pendingPrefillByConvoId(conversationId));
  const hasPrefill = prefillText.length > 0;
  const isActive = showPrefill || hasPrefill;

  const handleToggle = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      setShowPrefill((prev) => !prev);
    },
    [setShowPrefill],
  );

  return (
    <TooltipAnchor
      description={
        hasPrefill
          ? 'AI Prefill armed (click to toggle editor)'
          : 'Prefill AI response (force opening words)'
      }
      render={
        <button
          type="button"
          disabled={disabled}
          onClick={handleToggle}
          data-testid="prefill-toggle-button"
          aria-label="Prefill AI response"
          aria-pressed={isActive}
          className={cn(
            'relative flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy disabled:cursor-not-allowed disabled:opacity-50',
            isActive
              ? 'border-amber-500/50 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
              : 'border-border-light bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary',
          )}
        >
          <Wand2 className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">Prefill</span>
          {hasPrefill && (
            <span
              className="size-1.5 rounded-full bg-amber-400"
              aria-hidden="true"
              data-testid="prefill-active-dot"
            />
          )}
        </button>
      }
    />
  );
});

interface PrefillInputDrawerProps {
  conversationId: string;
  disabled?: boolean;
  isRTL?: boolean;
  mainTextAreaRef?: React.RefObject<HTMLTextAreaElement | null>;
  submitButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

export const PrefillInputDrawer = memo(function PrefillInputDrawer({
  conversationId,
  disabled = false,
  isRTL = false,
  mainTextAreaRef,
  submitButtonRef,
}: PrefillInputDrawerProps) {
  const [showPrefill, setShowPrefill] = useRecoilState(
    store.showPrefillInputByConvoId(conversationId),
  );
  const [prefillText, setPrefillText] = useRecoilState(
    store.pendingPrefillByConvoId(conversationId),
  );
  const prefillRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (showPrefill && prefillRef.current) {
      prefillRef.current.focus();
      const len = prefillRef.current.value.length;
      prefillRef.current.setSelectionRange(len, len);
    }
  }, [showPrefill]);

  const handleClearAndClose = useCallback(() => {
    setPrefillText('');
    setShowPrefill(false);
    mainTextAreaRef?.current?.focus();
  }, [setPrefillText, setShowPrefill, mainTextAreaRef]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowPrefill(false);
        mainTextAreaRef?.current?.focus();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitButtonRef?.current?.click();
      }
    },
    [setShowPrefill, mainTextAreaRef, submitButtonRef],
  );

  if (!showPrefill && prefillText.length === 0) {
    return null;
  }

  if (!showPrefill && prefillText.length > 0) {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-2 border-t border-border-light/60 bg-amber-500/5 px-4 py-1.5 text-xs text-text-secondary"
        data-testid="prefill-collapsed-preview"
      >
        <CornerDownRight className="size-3.5 shrink-0 text-amber-400" aria-hidden="true" />
        <button
          type="button"
          onClick={() => setShowPrefill(true)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left hover:text-text-primary"
        >
          <span className="shrink-0 font-medium text-amber-400">AI Prefill:</span>
          <span className="truncate font-mono text-text-primary">{prefillText}</span>
        </button>
        <button
          type="button"
          onClick={handleClearAndClose}
          aria-label="Clear AI prefill"
          className="shrink-0 rounded-full p-0.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="flex items-start gap-2 border-t border-border-light/70 bg-amber-500/5 px-4 py-2"
      data-testid="prefill-input-drawer"
    >
      <div className="mt-1.5 flex shrink-0 items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-400">
        <CornerDownRight className="size-3" aria-hidden="true" />
        <span>AI Starts With</span>
      </div>
      <TextareaAutosize
        ref={prefillRef}
        value={prefillText}
        disabled={disabled}
        rows={1}
        maxRows={5}
        dir={isRTL ? 'rtl' : 'ltr'}
        onKeyDown={handleKeyDown}
        onChange={(e) => setPrefillText(e.target.value)}
        placeholder="Force AI reply to start with exact text..."
        aria-label="Prefill AI response text"
        data-testid="prefill-textarea"
        className={cn(
          'm-0 min-h-[28px] w-full flex-1 resize-none border-0 bg-transparent px-1 py-1 text-sm text-text-primary',
          'placeholder-text-secondary/70 focus:ring-0 focus-visible:ring-0',
          isRTL ? 'text-right' : 'text-left',
          removeFocusRings,
        )}
      />
      <TooltipAnchor
        description="Clear & close prefill (Esc)"
        render={
          <button
            type="button"
            onClick={handleClearAndClose}
            aria-label="Clear and close AI prefill"
            data-testid="prefill-clear-button"
            className="mt-1 shrink-0 rounded-full p-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        }
      />
    </div>
  );
});
