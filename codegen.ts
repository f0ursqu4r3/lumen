import type { CodegenConfig } from '@graphql-codegen/cli'

// Introspects the self-hosted instance schema and turns src/**/*.graphql
// documents into typed TypedDocumentNodes under src/gitlab/generated/.
const url = process.env.GITLAB_URL
const token = process.env.GITLAB_TOKEN

const config: CodegenConfig = {
  schema: [
    {
      [`${url}/api/graphql`]: {
        headers: { 'PRIVATE-TOKEN': token ?? '' },
      },
    },
  ],
  documents: ['src/gitlab/{queries,mutations}/**/*.graphql'],
  generates: {
    'src/gitlab/generated/': {
      preset: 'client',
      config: { useTypeImports: true },
    },
  },
}

export default config
