import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'WorkFlow',
    short_name: 'WorkFlow',
    start_url: '/',
    display: 'standalone',
    background_color: '#16151c',
    theme_color: '#16151c',
    icons: [
      { src: '/brand/app-icon.png', sizes: '512x512', type: 'image/png' },
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
  }
}
