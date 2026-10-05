import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Generates the PNG icons and favicon in public/ from public/logo.svg: npm run icons
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#FFD9D2' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#FFD9D2' } },
  },
  images: ['public/logo.svg'],
});
