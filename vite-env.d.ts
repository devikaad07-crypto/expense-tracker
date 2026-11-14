/// <reference types="node" />

declare module 'vite' {
  export function defineConfig(config: any): any;
  export interface UserConfig {}
}

declare module '@tailwindcss/vite' {
  const plugin: () => any;
  export default plugin;
}

declare module '@vitejs/plugin-react' {
  const plugin: () => any;
  export default plugin;
}

declare module 'path' {
  export function resolve(...args: string[]): string;
  const path: {
    resolve(...args: string[]): string;
    [key: string]: any;
  };
  export default path;
}

declare const __dirname: string;
declare const process: {
  env: Record<string, string | undefined>;
};

