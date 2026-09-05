import { useRecoilValue } from 'recoil';
import { ChevronDown } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

type Props = {
  scrollHandler: React.MouseEventHandler<HTMLButtonElement>;
};

export default function ScrollToBottom({ scrollHandler }: Props) {
  const localize = useLocalize();
  const maximizeChatSpace = useRecoilValue(store.maximizeChatSpace);

  return (
    <div
      className={cn(
        'pointer-events-none absolute bottom-2 left-0 right-0 z-20 mx-auto flex justify-center px-4 md:px-5',
        maximizeChatSpace ? 'max-w-full' : 'md:max-w-3xl xl:max-w-4xl',
      )}
    >
      <button
        type="button"
        onClick={scrollHandler}
        className="chat-scroll-button pointer-events-auto cursor-pointer text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy"
        aria-label={localize('com_ui_scroll_to_bottom')}
      >
        <ChevronDown className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span>{localize('com_ui_scroll_to_bottom')}</span>
      </button>
    </div>
  );
}
