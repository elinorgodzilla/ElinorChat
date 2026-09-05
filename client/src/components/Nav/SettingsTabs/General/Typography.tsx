import { useId } from 'react';
import { useAtom } from 'jotai';
import { Trans } from 'react-i18next';
import { Dropdown } from '@librechat/client';
import type { FontFamily, FontWeight } from '~/store/typography';
import type { TranslationKeys } from '~/hooks/useLocalize';
import { FONT_FAMILIES, FONT_WEIGHTS, typographyAtom } from '~/store/typography';
import { useLocalize } from '~/hooks';

const familyLabels: Record<FontFamily, TranslationKeys> = {
  inter: 'com_ui_font_family_inter',
  'source-sans-3': 'com_ui_font_family_source_sans_3',
  system: 'com_ui_font_family_system',
  jost: 'com_ui_font_family_jost',
  'readex-pro': 'com_ui_font_family_readex_pro',
};

const weightLabels: Record<FontWeight, TranslationKeys> = {
  300: 'com_ui_font_weight_light',
  400: 'com_ui_font_weight_regular',
  500: 'com_ui_font_weight_medium',
};

export function FontFamilySetting() {
  const labelId = useId();
  const localize = useLocalize();
  const [preferences, setPreferences] = useAtom(typographyAtom);

  const handleChange = (value: string) => {
    const fontFamily = FONT_FAMILIES.find((family) => family === value);
    if (fontFamily === undefined) {
      return;
    }
    setPreferences((previous) => ({ ...previous, fontFamily }));
  };

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-2">
      <div id={labelId}>{localize('com_ui_font_family')}</div>
      <Dropdown
        value={preferences.fontFamily}
        options={FONT_FAMILIES.map((value) => ({ value, label: localize(familyLabels[value]) }))}
        onChange={handleChange}
        testId="font-family-selector"
        sizeClasses="max-w-[calc(100vw-2rem)]"
        className="z-50 max-w-full"
        aria-labelledby={labelId}
      />
    </div>
  );
}

export function FontWeightSetting() {
  const labelId = useId();
  const localize = useLocalize();
  const [preferences, setPreferences] = useAtom(typographyAtom);

  const handleChange = (value: string) => {
    const fontWeight = FONT_WEIGHTS.find((weight) => String(weight) === value);
    if (fontWeight === undefined) {
      return;
    }
    setPreferences((previous) => ({ ...previous, fontWeight }));
  };

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div id={labelId}>{localize('com_ui_font_weight')}</div>
        <Dropdown
          value={String(preferences.fontWeight)}
          options={FONT_WEIGHTS.map((value) => ({
            value: String(value),
            label: localize(weightLabels[value]),
          }))}
          onChange={handleChange}
          testId="font-weight-selector"
          sizeClasses="w-[150px]"
          className="z-50"
          aria-labelledby={labelId}
        />
      </div>
      <p className="text-xs font-normal text-text-secondary">
        {localize('com_ui_typography_help')}
      </p>
      <p
        className="rounded-lg border border-border-light p-3 text-sm text-text-primary"
        style={{ fontWeight: 'var(--app-font-weight)', fontFamily: 'var(--app-font-family)' }}
      >
        <Trans
          defaults={localize('com_ui_typography_preview')}
          components={{ strong: <strong />, em: <em /> }}
        />
      </p>
    </div>
  );
}
