import { useCallback } from 'react';
import { useLatestMessage } from '~/hooks/Messages/useLatestMessage';

export default function useHandleKeyUp({
  index,
  textAreaRef,
}: {
  index: number;
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
}) {
  const latestMessage = useLatestMessage(index);
  return useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'ArrowUp' || textAreaRef.current?.value !== '' || !latestMessage) {
        return;
      }
      const element = document.getElementById(`edit-${latestMessage.parentMessageId}`);
      if (element) {
        event.preventDefault();
        element.click();
      }
    },
    [textAreaRef, latestMessage],
  );
}
