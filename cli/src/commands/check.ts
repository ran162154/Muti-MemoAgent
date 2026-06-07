// CLI: memograph check — check Xiami quota and balance
import {MemographSDK} from '@memograph/sdk';

export async function checkCommand(opts: { entries?: string; agents?: string }): Promise<void> {
  const sdk = new MemographSDK();
  const required = parseInt(opts.entries || '5', 10);
  const agents = parseInt(opts.agents || '0', 10);

  console.log(`Checking quota (need ${required} entries, ${agents} agents)...\n`);
  const result = await sdk.checkBalance(required, agents);

  if (result.sufficient) {
    console.log(`✅ ${result.message}`);
  } else {
    console.log(`❌ ${result.message}`);
    console.log(`Action: ${result.action}`);
  }
}
