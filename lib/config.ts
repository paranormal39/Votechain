import './load-env';
import { z } from 'zod';

const configSchema = z.object({
  agility: z.object({
    baseUrl: z.string().url(),
    // Optional at load time so public/read-only flows work without a key.
    // Use requireAdminKey() before any write/authenticated request.
    adminKey: z.string(),
  }),
  database: z.object({
    url: z.string().optional(),
  }),
  chains: z.object({
    // Public JSON-RPC endpoints used to verify on-chain join requirements
    // (issued-token trustline balances and NFT ownership). Default to testnet.
    xrplRpcUrl: z.string().url(),
    xahauRpcUrl: z.string().url(),
  }),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const raw = {
    agility: {
      baseUrl: process.env.AGILITY_BASE_URL || 'https://agilitycore-production.up.railway.app',
      adminKey: process.env.AGILITY_ADMIN_KEY || '',
    },
    database: {
      url: process.env.DATABASE_URL,
    },
    chains: {
      xrplRpcUrl: process.env.XRPL_RPC_URL || 'https://s.altnet.rippletest.net:51234/',
      xahauRpcUrl: process.env.XAHAU_RPC_URL || 'https://xahau-test.net/',
    },
  };

  const result = configSchema.safeParse(raw);

  if (!result.success) {
    console.error('Config validation failed:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    throw new Error('Invalid configuration. Check .env and .env.example');
  }

  return result.data;
}

export const config = loadConfig();

export function requireAdminKey(): string {
  if (!config.agility.adminKey) {
    throw new Error('AGILITY_ADMIN_KEY required but not set');
  }
  return config.agility.adminKey;
}
