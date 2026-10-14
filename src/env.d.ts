interface ImportMetaEnv {
  /** Token opcional para a API do GitHub (só no build). */
  readonly GITHUB_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
