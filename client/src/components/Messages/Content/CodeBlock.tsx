import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { CodeBarProps } from '~/common';
import FloatingCodeBar from '~/components/Messages/Content/FloatingCodeBar';
import CodeBar from '~/components/Messages/Content/CodeBar';
import cn from '~/utils/cn';

type CodeBlockProps = Pick<CodeBarProps, 'lang' | 'plugin' | 'error' | 'blockIndex'> & {
  codeChildren: React.ReactNode;
  classProp?: string;
};

const CodeBlock: React.FC<CodeBlockProps> = ({
  lang,
  blockIndex,
  codeChildren,
  classProp = '',
  plugin = null,
  error,
}) => {
  const codeRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const codeBarRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isCodeBarVisible, setIsCodeBarVisible] = useState(true);

  useEffect(() => {
    const el = codeBarRef.current;
    if (!el) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsCodeBarVisible(entry.isIntersecting),
      { root: null, threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleFocus = useCallback(() => setIsHovered(true), []);

  const handleBlur = useCallback((e: React.FocusEvent) => {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setIsHovered(false);
    }
  }, []);

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);

  const handleMouseLeave = useCallback(() => {
    if (!containerRef.current?.contains(document.activeElement)) {
      setIsHovered(false);
    }
  }, []);

  const isNonCode = !!(plugin === true || error === true);
  const language = isNonCode ? 'json' : lang;
  const showFloating = isHovered && !isCodeBarVisible;

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-xl border border-border-light text-xs"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <div ref={codeBarRef}>
        <CodeBar
          lang={lang}
          error={error}
          codeRef={codeRef}
          blockIndex={blockIndex}
          plugin={plugin === true}
        />
      </div>
      <div
        className={cn(classProp, 'overflow-y-auto bg-surface-chat p-4 dark:bg-surface-primary-alt')}
      >
        <code
          ref={codeRef}
          className={cn(
            isNonCode ? '!whitespace-pre-wrap' : `hljs language-${language} !whitespace-pre`,
          )}
        >
          {codeChildren}
        </code>
      </div>
      <FloatingCodeBar
        lang={lang}
        error={error}
        codeRef={codeRef}
        blockIndex={blockIndex}
        plugin={plugin === true}
        isVisible={showFloating}
      />
    </div>
  );
};

export default CodeBlock;
