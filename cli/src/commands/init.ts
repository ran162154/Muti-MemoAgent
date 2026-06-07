import {MemographSDK} from '@mutimemoagent/sdk';
import type {InitOptions} from '@mutimemoagent/core';

export interface InitOptionsCLI {
  xiamiKey?: string;
  projectName?: string;
  profile?: boolean;
  mcp?: boolean;
}

/**
 * `memograph init` — 初始化
 */
export async function initCommand(options: InitOptionsCLI): Promise<void> {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║        Memograph Initialization         ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');

  const sdk = new MemographSDK();

  const initOpts: InitOptions = {
    xiamiKey: options.xiamiKey,
    createProfile: options.profile !== false,
    createMCPRegistry: options.mcp !== false,
    initProject: !!options.projectName,
    projectName: options.projectName,
  };

  const result = await sdk.init(initOpts);

  if (result.success) {
    console.log('');
    console.log('  ✅ Ready! Quick start:');
    console.log('');
    if (result.agents.length > 0) {
      console.log(`     memograph memo "your first memory"`);
      console.log(`     memograph search "something you know"`);
      console.log(`     memograph status`);
      console.log(`     memograph index`);
    }
    console.log('');
  } else {
    console.log('');
    console.log('  ❌ Initialization failed. Check the errors above.');
    console.log('');
    process.exit(1);
  }
}
