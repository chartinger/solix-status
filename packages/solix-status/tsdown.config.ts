import { defineConfig } from 'tsdown'

export default defineConfig({
    name: "@lab759/solix-status",
    entry: ['./src/index.ts', './src/cli.ts', './src/mqtt-cli.ts'],
    exports: {
        devExports: true,
        enabled: true,
    },
    publint: true,
    dts: true,
    attw: {
        profile: "esm-only",
    },
    format: ["esm"],
})