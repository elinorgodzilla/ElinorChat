import { forwardRef } from 'react';
import { Input, Label } from '@librechat/client';
import type { ChangeEvent, FC, Ref } from 'react';
import { cn } from '~/utils/';
import { useLocalize } from '~/hooks';

interface InputWithLabelProps {
  id: string;
  value: string;
  label: string;
  subLabel?: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  labelClassName?: string;
  inputClassName?: string;
  ref?: Ref<HTMLInputElement>;
}

const InputWithLabel: FC<InputWithLabelProps> = forwardRef((props, ref) => {
  const { id, value, label, subLabel, onChange, labelClassName = '', inputClassName = '' } = props;
  const localize = useLocalize();
  return (
    <>
      <div className={cn('mt-4 flex flex-row', labelClassName)}>
        <Label htmlFor={id} className="text-left text-sm font-medium">
          {label}
        </Label>
        {subLabel && (
          <Label className="mx-1 text-right text-sm text-text-secondary">{subLabel}</Label>
        )}
        <br />
      </div>
      <div className="h-1" />
      <Input
        id={id}
        type="text"
        data-testid={`input-${id}`}
        value={value ?? ''}
        onChange={(event) => {
          event.target.value = event.target.value.trim();
          onChange(event);
        }}
        ref={ref}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        data-lpignore="true"
        data-1p-ignore="true"
        placeholder={`${localize('com_endpoint_config_value')} ${label}`}
        className={cn('flex h-10 max-h-10 w-full resize-none px-3 py-2', inputClassName)}
      />
    </>
  );
});

export default InputWithLabel;
