import { defineConfig } from '@rsbuild/core';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginReact } from '@rsbuild/plugin-react';
import { RsdoctorRspackPlugin } from '@rsdoctor/rspack-plugin';

const publicBasePath = process.env.PUBLIC_BASE_PATH || '/';
const publicSiteUrl =
  'https://rayyan2006bd-coder.github.io/ruet-cover-page-generator-2/';

export default defineConfig({
  output: {
    assetPrefix: publicBasePath,
    sourceMap: false,
  },
  plugins: [pluginReact(), pluginNodePolyfill()],
  html: {
    title: 'RUET Cover Page Generator',
    favicon: './public/favicon.ico',
    template: './src/index.html',
    appIcon: {
      name: 'RUET Cover Page Generator',
      icons: [
        {
          src: './public/apple-touch-icon.png',
          size: 180,
          target: 'apple-touch-icon',
        },
        {
          src: './public/android-chrome-192x192.png',
          size: 192,
          target: 'web-app-manifest',
        },
        {
          src: './public/android-chrome-512x512.png',
          size: 512,
          target: 'web-app-manifest',
        },
      ],
    },
    meta: {
      description: 'Create cover pages for your lab reports and assignments',
      'msapplication-TileColor': '#603cba',
      'og:url': publicSiteUrl,
      'og:title': 'RUET Cover Page Generator',
      'og:description':
        'Create cover pages for your lab reports and assignments',
      'og:image': `${publicSiteUrl}og.jpg`,
      'og:image:width': '1200',
      'og:image:height': '630',
      'og:image:type': 'image/jpeg',
      'og:type': 'website',
      'og:locale': 'en_US',
    },
  },
  tools: {
    rspack(_config, { appendPlugins }) {
      // Only register the plugin when RSDOCTOR is true, as the plugin will increase the build time.
      if (process.env.RSDOCTOR) {
        appendPlugins(
          new RsdoctorRspackPlugin({
            supports: {
              generateTileGraph: true,
            },
          }),
        );
      }
    },
  },
});
