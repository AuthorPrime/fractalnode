import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'identity/index': 'src/identity/index.ts',
    'client/index': 'src/client/index.ts',
    'value/index': 'src/value/index.ts',
    'quality/index': 'src/quality/index.ts',
    'nft/index': 'src/nft/index.ts',
    'agent/index': 'src/agent/index.ts',
    'governance/index': 'src/governance/index.ts',
    'continuity/index': 'src/continuity/index.ts',
    'memory/index': 'src/memory/index.ts',
    'compute/index': 'src/compute/index.ts',
    'lifecycle/index': 'src/lifecycle/index.ts',
    'signal/index': 'src/signal/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  splitting: true,
  sourcemap: true,
})
