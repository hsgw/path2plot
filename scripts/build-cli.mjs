import { readFile } from 'node:fs/promises'
import { build } from 'vite'

const licenses = await Promise.all(
  ['@xmldom/xmldom', 'clipper2-ts'].map(async (name) => {
    const file = new URL(`../node_modules/${name}/LICENSE`, import.meta.url)
    return `/*! ${name}\n${(await readFile(file, 'utf8')).trim().replaceAll('*/', '* /')}\n*/`
  }),
)

const outDir = process.argv[2] ?? 'dist-ssr'
const mode = process.argv[3] ?? 'production'
const entry = process.argv[4] ?? 'src/cli/path2plot.ts'
const fileName = process.argv[5] ?? 'path2plot-cli.mjs'

await build({
  configFile: false,
  define: {
    'import.meta.env.MODE': JSON.stringify(mode),
  },
  ssr: { noExternal: true },
  build: {
    ssr: entry,
    mode,
    target: 'node22',
    outDir,
    emptyOutDir: false,
    rolldownOptions: {
      output: {
        entryFileNames: fileName,
        banner: licenses.join('\n\n'),
      },
    },
  },
})
