import { useLayoutEffect } from 'react';
import { useAtomValue } from 'jotai';
import { applyTypography, typographyAtom } from '~/store/typography';

export default function Typography() {
  const preferences = useAtomValue(typographyAtom);

  useLayoutEffect(() => {
    applyTypography(preferences);
  }, [preferences]);

  return null;
}
