const publicBasePath = process.env.PUBLIC_BASE_PATH || '/';

module.exports = {
  globDirectory: 'dist/',
  globPatterns: [
    '**/*.{mjs,txt,png,ico,html,webmanifest,jpg,jpeg,webp,svg,css,ttf,js,json,wasm,gz}',
  ],
  swDest: 'dist/sw.js',
  navigateFallback: `${publicBasePath}index.html`,
  modifyURLPrefix: {
    '': publicBasePath,
  },
  navigateFallbackDenylist: [/^\/api\//],
  cleanupOutdatedCaches: true,
  clientsClaim: false,
  skipWaiting: false,
  ignoreURLParametersMatching: [/^utm_/, /^fbclid$/],
  maximumFileSizeToCacheInBytes: 5000000,
  runtimeCaching: [
    {
      urlPattern: ({ url }) => url.pathname.startsWith('/api/v1/dataset/'),
      handler: 'NetworkFirst',
      options: {
        cacheName: 'ruet-directory-releases',
        networkTimeoutSeconds: 4,
        expiration: { maxEntries: 6, maxAgeSeconds: 30 * 24 * 60 * 60 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],
};
