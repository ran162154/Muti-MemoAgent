// CLI: memograph onboard — first-time setup wizard
import {MemographSDK} from '@mutimemoagent/sdk';

export async function onboardCommand(): Promise<void> {
  const sdk = new MemographSDK();
  await sdk.onboard();
}
