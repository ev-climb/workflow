import type { NextConfig } from 'next'

const config: NextConfig = {
  // образ несёт только то, что нужно на запуске: без devDeps и без исходников
  output: 'standalone',

  // иначе next dev дописывает свой блок в CLAUDE.md проекта — файл ведём руками
  agentRules: false,
}

export default config
