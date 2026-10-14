import { validateVisionModel } from './config';

describe('validateVisionModel', () => {
  it.each([
    'gemini-pro-vision',
    'gemini-exp-1206',
    'gemini-1.5-pro',
    'gemini-2.0-flash',
    'gemini-2.5-pro',
    'gemini-3-pro-preview',
    'google/gemini-3-flash-preview',
    'gpt-4o',
    'gpt-5',
    'claude-sonnet-4',
  ])('preserves support for existing vision model %s', (model) => {
    expect(validateVisionModel({ model })).toBe(true);
  });

  it.each([
    'Gemini4',
    'gemini4',
    'GEMINI4',
    'gemini-4',
    'GeMiNi-4',
    'gemini4-pro',
    'gemini-4-flash-preview',
    'gemini-4.0-pro',
    'gemini4_pro',
    'google/gemini4',
    'google/GEMINI-4-PRO',
    'google:Gemini4',
    'models/gemini-4',
    'publishers/google/models/GeMiNi4-pro',
  ])('recognizes bounded Gemini 4 alias %s', (model) => {
    expect(validateVisionModel({ model })).toBe(true);
  });

  it.each([
    '',
    'unknown-model',
    'gemini-pro',
    'gemini-5-pro',
    'gemini40',
    'gemini-40-pro',
    'google/GEMINI40',
    'models/GEMINI-40-flash',
    'notgemini4',
    'google/notgemini-4',
    'gemini4x',
    'gemini-4pro',
  ])('rejects unknown or unbounded model %s', (model) => {
    expect(validateVisionModel({ model })).toBe(false);
  });

  describe('availableModels', () => {
    it.each(['Gemini4', 'google/GEMINI-4-pro', 'gemini-3-pro-preview', 'gpt-4o'])(
      'requires exact allowlist membership for %s',
      (model) => {
        expect(validateVisionModel({ model, availableModels: [model] })).toBe(true);
        expect(validateVisionModel({ model, availableModels: [] })).toBe(false);
        expect(validateVisionModel({ model, availableModels: ['another-model'] })).toBe(false);
      },
    );

    it('does not normalize case or prefixes for allowlist membership', () => {
      expect(validateVisionModel({ model: 'Gemini4', availableModels: ['gemini4'] })).toBe(false);
      expect(validateVisionModel({ model: 'google/gemini-4', availableModels: ['gemini-4'] })).toBe(
        false,
      );
    });

    it('does not grant vision support solely through allowlist membership', () => {
      expect(
        validateVisionModel({ model: 'unknown-model', availableModels: ['unknown-model'] }),
      ).toBe(false);
    });
  });

  it.each(['gpt-4-turbo-preview', 'o1-mini', 'gemini4-gpt-4-turbo-preview', 'gemini-4-o1-mini'])(
    'preserves negative restrictions for %s even with explicit lists',
    (model) => {
      expect(validateVisionModel({ model })).toBe(false);
      expect(
        validateVisionModel({ model, availableModels: [model], additionalModels: [model] }),
      ).toBe(false);
    },
  );

  describe('additionalModels', () => {
    it('preserves substring matching for custom models', () => {
      expect(
        validateVisionModel({
          model: 'provider/custom-vision-v2',
          additionalModels: ['custom-vision'],
        }),
      ).toBe(true);
    });

    it('preserves case-sensitive matching for custom models', () => {
      expect(
        validateVisionModel({ model: 'Custom-Vision', additionalModels: ['custom-vision'] }),
      ).toBe(false);
    });

    it('still requires allowlist membership for custom models', () => {
      const model = 'custom-vision';
      expect(
        validateVisionModel({ model, additionalModels: [model], availableModels: [model] }),
      ).toBe(true);
      expect(validateVisionModel({ model, additionalModels: [model], availableModels: [] })).toBe(
        false,
      );
    });

    it('can explicitly enable models outside the built-in Gemini 4 boundary', () => {
      expect(validateVisionModel({ model: 'gemini40', additionalModels: ['gemini40'] })).toBe(true);
    });
  });
});
