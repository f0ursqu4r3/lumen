import type { CodegenConfig } from '@graphql-codegen/cli'
import { loadEnv } from 'vite'

// Introspects the self-hosted instance schema and turns inline graphql()
// documents into typed TypedDocumentNodes under src/gitlab/generated/.
// Load GITLAB_* from the same .env files Vite uses (.env, .env.local,
// .env.<mode>, ...) so codegen and the dev server agree on configuration.
const env = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), 'GITLAB_')
const url = (env.GITLAB_URL ?? '').replace(/\/+$/, '')
const token = env.GITLAB_TOKEN

const config: CodegenConfig = {
  schema: [
    {
      [`${url}/api/graphql`]: {
        headers: { 'PRIVATE-TOKEN': token ?? '' },
      },
    },
  ],
  documents: ['src/**/*.{ts,vue}', '!src/**/*.test.ts', '!src/gitlab/generated/**'],
  generates: {
    'src/gitlab/generated/': {
      preset: 'client',
      // enumsAsTypes: GitLab's sort enums expose both deprecated lowercase and
      // uppercase values that PascalCase-collapse to duplicate TS enum members
      // (TS2300). Emitting string-literal unions avoids the collision and suits
      // our usage (we pass plain string args).
      config: { useTypeImports: true, enumsAsTypes: true },
    },
  },
}

export default config
