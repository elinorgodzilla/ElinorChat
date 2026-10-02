import React from 'react';
import userEvent from '@testing-library/user-event';
import { AuthKeys, EModelEndpoint } from 'librechat-data-provider';
import { render, screen, fireEvent, waitFor } from 'test/layout-test-utils';
import useUserKey from '~/hooks/Input/useUserKey';
import SetKeyDialog from '../SetKeyDialog';

jest.mock('~/hooks/Input/useUserKey', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const saveUserKey = jest.fn();

const providers = [
  {
    endpoint: 'OpenRouter',
    endpointType: EModelEndpoint.custom,
    inputId: 'apiKey',
    savedValue: JSON.stringify({ apiKey: 'sk-test-key', baseURL: '' }),
  },
  {
    endpoint: EModelEndpoint.openAI,
    inputId: 'apiKey',
    savedValue: JSON.stringify({ apiKey: 'sk-test-key', baseURL: '' }),
  },
  {
    endpoint: EModelEndpoint.anthropic,
    inputId: EModelEndpoint.anthropic,
    savedValue: 'sk-test-key',
  },
  {
    endpoint: EModelEndpoint.google,
    inputId: AuthKeys.GOOGLE_API_KEY,
    savedValue: JSON.stringify({ [AuthKeys.GOOGLE_API_KEY]: 'sk-test-key' }),
  },
];

describe('Provider API key entry', () => {
  beforeEach(() => {
    jest.mocked(useUserKey).mockReturnValue({
      getExpiry: () => undefined,
      checkExpiry: () => true,
      saveUserKey,
    });
  });

  it.each(providers)(
    'shows $endpoint keys as plain text and saves pasted keys without surrounding whitespace',
    async ({ endpoint, endpointType, inputId, savedValue }) => {
      const user = userEvent.setup();
      render(
        <SetKeyDialog
          open
          onOpenChange={jest.fn()}
          endpoint={endpoint}
          endpointType={endpointType}
        />,
      );

      const input = screen.getByTestId(`input-${inputId}`);
      expect(input).toHaveAttribute('type', 'text');
      expect(input).toHaveAttribute('autocomplete', 'off');
      expect(input).toHaveAttribute('autocapitalize', 'none');
      expect(input).toHaveAttribute('autocorrect', 'off');
      expect(input).toHaveAttribute('spellcheck', 'false');
      expect(document.querySelector('input[type="password"]')).not.toBeInTheDocument();

      await user.click(input);
      await user.paste(' \t\n sk-test-key \r\n\u00a0');
      expect(input).toHaveValue('sk-test-key');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => expect(saveUserKey).toHaveBeenCalledWith(savedValue, null));
    },
  );

  it.each(providers.filter(({ endpoint }) => endpoint !== EModelEndpoint.google))(
    'rejects whitespace-only $endpoint keys',
    async (props) => {
      render(<SetKeyDialog open onOpenChange={jest.fn()} {...props} />);

      const input = screen.getByTestId(`input-${props.inputId}`);
      fireEvent.change(input, { target: { value: ' \t\u00a0 ' } });
      expect(input).toHaveValue('');
      await userEvent.click(screen.getByRole('button', { name: /submit/i }));

      expect(saveUserKey).not.toHaveBeenCalled();
    },
  );

  it('trims Azure keys before serializing the nested credentials', async () => {
    render(<SetKeyDialog open onOpenChange={jest.fn()} endpoint={EModelEndpoint.azureOpenAI} />);

    const fields = {
      azureOpenAIApiKey: 'sk-test-key',
      azureOpenAIApiInstanceName: 'test-instance',
      azureOpenAIApiDeploymentName: 'test-deployment',
      azureOpenAIApiVersion: '2024-10-21',
    };
    for (const [name, value] of Object.entries(fields)) {
      const input = screen.getByTestId(`input-${name}`);
      expect(input).toHaveAttribute('type', 'text');
      fireEvent.change(input, { target: { value: `  ${value}  ` } });
    }
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() =>
      expect(saveUserKey).toHaveBeenCalledWith(
        JSON.stringify({ apiKey: JSON.stringify(fields), baseURL: '' }),
        null,
      ),
    );
  });

  it('preserves characters inside a key', async () => {
    render(<SetKeyDialog open onOpenChange={jest.fn()} endpoint={EModelEndpoint.anthropic} />);

    fireEvent.change(screen.getByTestId(`input-${EModelEndpoint.anthropic}`), {
      target: { value: '  sk-test aB+/=_-key  ' },
    });
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(saveUserKey).toHaveBeenCalledWith('sk-test aB+/=_-key', null);
  });
});
