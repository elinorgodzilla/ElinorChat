import React, { useRef } from 'react';
import { render, screen, fireEvent, createEvent } from '@testing-library/react';
import { useLatestMessage } from '~/hooks/Messages/useLatestMessage';
import useHandleKeyUp from './useHandleKeyUp';

jest.mock('~/hooks/Messages/useLatestMessage', () => ({
  useLatestMessage: jest.fn(() => ({ parentMessageId: 'user-message' })),
}));

function Composer({ value = '' }: { value?: string }) {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const onKeyUp = useHandleKeyUp({ index: 0, textAreaRef });
  return <textarea ref={textAreaRef} defaultValue={value} onKeyUp={onKeyUp} />;
}

describe('lean composer keyboard handling', () => {
  it.each(['@', '+', '$', '/', 'text'])('leaves %s as ordinary text', (value) => {
    render(<Composer value={value} />);
    const input = screen.getByRole('textbox');
    const event = createEvent.keyUp(input, { key: value, cancelable: true });
    fireEvent(input, event);
    expect(event.defaultPrevented).toBe(false);
    expect(input).toHaveValue(value);
  });

  it.each(['', 'not empty'])('edits the latest user message only for empty input: %j', (value) => {
    const onClick = jest.fn();
    render(
      <>
        <Composer value={value} />
        <button id="edit-user-message" onClick={onClick}>
          {'Edit'}
        </button>
      </>,
    );
    const input = screen.getByRole('textbox');
    const event = createEvent.keyUp(input, { key: 'ArrowUp', cancelable: true });
    fireEvent(input, event);
    expect(onClick).toHaveBeenCalledTimes(value === '' ? 1 : 0);
    expect(event.defaultPrevented).toBe(value === '');
  });

  it('does nothing when the latest message is absent', () => {
    jest.mocked(useLatestMessage).mockReturnValueOnce(null);
    render(<Composer />);
    const input = screen.getByRole('textbox');
    const event = createEvent.keyUp(input, { key: 'ArrowUp', cancelable: true });
    fireEvent(input, event);
    expect(event.defaultPrevented).toBe(false);
  });
});
