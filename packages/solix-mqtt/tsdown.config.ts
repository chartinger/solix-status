import { defineConfig } from 'tsdown'

export default defineConfig({
    name: "@lab759/solix-mqtt",
    entry: ['./src/index.ts'],
    exports: {
        devExports: true,
        enabled: true,
    },
    publint: true,
    dts: true,
    attw: {
        profile: "node16",
    },
    format: ["esm", "cjs"],
})