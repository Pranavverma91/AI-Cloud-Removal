import type {NextConfig} from 'next';
import path from 'node:path';
const standalone=process.env.SPACE_EYE_STANDALONE==='true';
const config:NextConfig={
 ...(standalone?{output:'standalone' as const}:{}),
 distDir:standalone?'.next-standalone':'.next',
 typescript:{tsconfigPath:standalone?'tsconfig.next.json':'tsconfig.json'},
 webpack(config,{webpack}){if(standalone)config.plugins.push(new webpack.NormalModuleReplacementPlugin(/^cloudflare:workers$/,path.resolve('frontend/adapters/cloudflare-node.ts')));return config}
};
export default config;
