import { readFile } from 'node:fs/promises'
import { build } from 'vite'

const licenses = await Promise.all(
  ['@xmldom/xmldom', 'clipper2-ts'].map(async (name) => {
    const file = new URL(`../node_modules/${name}/LICENSE`, import.meta.url)
    return `/*! ${name}\n${(await readFile(file, 'utf8')).trim().replaceAll('*/', '* /')}\n*/`
  }),
)

await build({
  configFile: false,
  define: {
    'import.meta.env.MODE': JSON.stringify(process.argv[3] ?? 'production'),
  },
  ssr: { noExternal: true },
  build: {
    ssr: 'src/cli/path2plot.ts',
    mode: process.argv[3] ?? 'production',
    target: 'node22',
    outDir: process.argv[2] ?? 'dist-ssr',
    emptyOutDir: false,
    rolldownOptions: {
      output: {
        entryFileNames: 'path2plot-cli.mjs',
        banner: licenses.join('\n\n'),
      },
    },
  },
})
