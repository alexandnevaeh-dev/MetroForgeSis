import { PRODUCT } from '@metroforge/shared';

export function getProductInfo() {
  return {
    ...PRODUCT,
    name: process.env.METROFORGE_APP_NAME ?? PRODUCT.defaultName,
  };
}

export function getVersionString(): string {
  return `${getProductInfo().name} v${PRODUCT.version}`;
}
