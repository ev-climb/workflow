import type { NextConfig } from 'next'

const config: NextConfig = {
  // иначе next dev дописывает свой блок в CLAUDE.md проекта — файл ведём руками
  agentRules: false,
}

export default config
