import { defineConfig } from 'tsdown'

export default defineConfig({
    name: "@lab759/solix-api",
    entry: ['./src/index.ts'],
    exports: {
        enabled: true,
    },
    publint: true,
    dts: true,
    attw: {
        profile: "node16",
    },
    format: ["esm", "cjs"],
})