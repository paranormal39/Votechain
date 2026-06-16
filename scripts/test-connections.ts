import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AgilityClient, AgilityError } from '../lib/agility/index';
import { config } from '../lib/config';
import { DEPLOYED_CONTRACTS } from '../lib/contracts';
import { generateAllWallets, saveWalletBundle } from './wallets/index';
import type { WalletBundle } from './wallets/index';

interface TestResult {
  name: string;
  group: 'public' | 'authenticated';
  status: 'pass' | 'fail' | 'skip';
  durationMs: number;
  detail?: string;
  error?: string;
}

const TEST_TAG = `vc-test-${Date.now()}`;

class TestRunner {
  private results: TestResult[] = [];

  async run(
    name: string,
    group: TestResult['group'],
    fn: () => Promise<string | void>
  ): Promise<void> {
    const start = Date.now();
    try {
      const detail = await fn();
      this.results.push({
        name,
        group,
        status: 'pass',
        durationMs: Date.now() - start,
        detail: detail || undefined,
      });
    } catch (err) {
      const message =
        err instanceof AgilityError
          ? `[${err.status}${err.code ? ` ${err.code}` : ''}] ${err.message}`
          : (err as Error).message;
      this.results.push({
        name,
        group,
        status: 'fail',
        durationMs: Date.now() - start,
        error: message,
      });
    }
  }

  skip(name: string, group: TestResult['group'], reason: string): void {
    this.results.push({ name, group, status: 'skip', durationMs: 0, detail: reason });
  }

  getResults(): TestResult[] {
    return this.results;
  }

  summary() {
    const pass = this.results.filter((r) => r.status === 'pass').length;
    const fail = this.results.filter((r) => r.status === 'fail').length;
    const skip = this.results.filter((r) => r.status === 'skip').length;
    return { pass, fail, skip, total: this.results.length };
  }
}

function printTable(results: TestResult[]): void {
  const icon = { pass: 'PASS', fail: 'FAIL', skip: 'SKIP' } as const;
  let currentGroup = '';
  for (const r of results) {
    if (r.group !== currentGroup) {
      currentGroup = r.group;
      console.log(`\n  --- ${currentGroup.toUpperCase()} ---`);
    }
    const line = `  [${icon[r.status]}] ${r.name.padEnd(42)} ${String(r.durationMs).padStart(5)}ms`;
    console.log(line);
    if (r.detail) console.log(`         ${r.detail}`);
    if (r.error) console.log(`         ERROR: ${r.error}`);
  }
}

async function main() {
  console.log('VoteChain Phase 1 - AgilityCore connection test suite');
  console.log(`Target: ${config.agility.baseUrl}`);
  console.log(`Admin key: ${config.agility.adminKey ? 'present' : 'MISSING'}`);
  console.log(`Test tag: ${TEST_TAG}`);

  const client = new AgilityClient();
  const runner = new TestRunner();

  // Generate fresh wallets for this run.
  let wallets: WalletBundle;
  try {
    wallets = await generateAllWallets();
    saveWalletBundle(wallets);
    console.log('\nGenerated test wallets:');
    for (const [chain, w] of Object.entries(wallets.wallets)) {
      console.log(`  ${chain.padEnd(8)} ${w.address}`);
    }
  } catch (err) {
    console.error('Failed to generate wallets:', (err as Error).message);
    process.exit(1);
  }

  const voterAddress = wallets.wallets.xrpl.address;
  const midnightWallet = wallets.wallets.midnight.address;

  console.log('\nDeployed contracts (reference):');
  for (const c of DEPLOYED_CONTRACTS) {
    const ref = c.address ?? c.txHash ?? 'n/a';
    console.log(`  ${c.chain.padEnd(8)} ${c.network.padEnd(8)} ${c.name.padEnd(10)} ${ref}`);
  }

  // ---- PUBLIC ENDPOINTS ----
  await runner.run('GET /health', 'public', async () => {
    const res = await client.health();
    const data = res.data;
    if (!data || data.status !== 'ok') throw new Error('health status not ok');
    const chains = Object.keys(data.chains ?? {}).join(', ');
    return `status=${data.status} sim=${data.simulation} chains=[${chains}]`;
  });

  await runner.run('GET /wallet/address', 'public', async () => {
    const res = await client.walletAddress();
    return `address=${res.data?.address ?? 'n/a'}`;
  });

  await runner.run('GET /wallet/balance', 'public', async () => {
    const res = await client.walletBalance();
    return `balance=${res.data?.balance ?? 'n/a'} ${res.data?.symbol ?? ''}`.trim();
  });

  await runner.run('GET /dao/state', 'public', async () => {
    const res = await client.daoState();
    return `proposalCount=${res.data?.proposalCount ?? 'n/a'}`;
  });

  await runner.run('GET /agents', 'public', async () => {
    const res = await client.listAgents();
    const count = Array.isArray(res.data) ? res.data.length : 'unknown';
    return `agents=${count}`;
  });

  await runner.run('GET /api/v1/votechain/feed', 'public', async () => {
    const res = await client.feed();
    const count = Array.isArray(res.data) ? res.data.length : 0;
    return `proposals=${count}`;
  });

  await runner.run('GET /api/v1/votechain/daos', 'public', async () => {
    const res = await client.listDaos();
    const count = Array.isArray(res.data) ? res.data.length : 0;
    return `daos=${count}`;
  });

  // ---- AUTHENTICATED (ADMIN) ENDPOINTS ----
  if (!config.agility.adminKey) {
    runner.skip('all authenticated tests', 'authenticated', 'AGILITY_ADMIN_KEY not set');
  } else {
    let createdDaoId: string | undefined;
    let createdProposalId: string | undefined;

    await runner.run('POST /api/v1/votechain/daos (create)', 'authenticated', async () => {
      const res = await client.createDao({
        name: `${TEST_TAG}-dao`,
        description: 'VoteChain Phase 1 connection test DAO',
        chain: 'xrpl',
      });
      createdDaoId = res.data?.id;
      if (!createdDaoId) throw new Error('no DAO id returned');
      return `daoId=${createdDaoId}`;
    });

    await runner.run('POST /api/v1/votechain/proposals (create)', 'authenticated', async () => {
      if (!createdDaoId) throw new Error('no DAO id from previous step');
      const res = await client.createProposal({
        daoId: createdDaoId,
        title: `${TEST_TAG}-proposal`,
        summary: 'Phase 1 connection test proposal',
        description: 'Created by VoteChain test-connections harness',
        chain: 'xrpl',
        status: 'active',
      });
      createdProposalId = res.data?.id;
      if (!createdProposalId) throw new Error('no proposal id returned');
      return `proposalId=${createdProposalId}`;
    });

    await runner.run('GET /api/v1/votechain/proposals/{id}', 'authenticated', async () => {
      if (!createdProposalId) throw new Error('no proposal id from previous step');
      const res = await client.getProposal(createdProposalId);
      return `title=${res.data?.title ?? 'n/a'} status=${res.data?.status ?? 'n/a'}`;
    });

    await runner.run('POST /api/v1/votechain/vote/yes', 'authenticated', async () => {
      if (!createdProposalId) throw new Error('no proposal id from previous step');
      const res = await client.voteYes({ proposalId: createdProposalId, walletAddress: voterAddress });
      return `success=${res.data?.success ?? res.success} txHash=${res.data?.txHash ?? 'n/a'}`;
    });

    await runner.run('POST /api/v1/votechain/vote/private', 'authenticated', async () => {
      if (!createdProposalId) throw new Error('no proposal id from previous step');
      const res = await client.votePrivate({
        proposalId: createdProposalId,
        walletAddress: wallets.wallets.cardano.address,
        proofHash: `sim_proof_${midnightWallet.slice(-8)}`,
      });
      return `success=${res.data?.success ?? res.success} txHash=${res.data?.txHash ?? 'n/a'}`;
    });

    await runner.run('POST /api/v1/votechain/proposals/comment', 'authenticated', async () => {
      if (!createdProposalId) throw new Error('no proposal id from previous step');
      const res = await client.commentProposal({
        proposalId: createdProposalId,
        walletAddress: voterAddress,
        comment: 'Phase 1 harness test comment',
      });
      return `commentId=${res.data?.id ?? 'n/a'}`;
    });

    await runner.run('POST /api/v1/votechain/daos/follow', 'authenticated', async () => {
      if (!createdDaoId) throw new Error('no DAO id from previous step');
      await client.followDao({ daoId: createdDaoId, walletAddress: voterAddress });
      return 'followed';
    });

    await runner.run('POST /api/v1/votechain/daos/unfollow', 'authenticated', async () => {
      if (!createdDaoId) throw new Error('no DAO id from previous step');
      await client.unfollowDao({ daoId: createdDaoId, walletAddress: voterAddress });
      return 'unfollowed';
    });
  }

  // ---- REPORT ----
  const results = runner.getResults();
  printTable(results);

  const summary = runner.summary();
  console.log(
    `\nSummary: ${summary.pass} passed, ${summary.fail} failed, ${summary.skip} skipped (${summary.total} total)`
  );

  const reportDir = resolve(process.cwd(), 'reports');
  mkdirSync(reportDir, { recursive: true });
  const reportPath = resolve(reportDir, 'phase1-connection-report.json');
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        target: config.agility.baseUrl,
        testTag: TEST_TAG,
        ranAt: new Date().toISOString(),
        summary,
        results,
        wallets: Object.fromEntries(
          Object.entries(wallets.wallets).map(([c, w]) => [c, { network: w.network, address: w.address }])
        ),
        deployedContracts: DEPLOYED_CONTRACTS,
      },
      null,
      2
    ),
    'utf8'
  );
  console.log(`Report written to ${reportPath}`);

  process.exit(summary.fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test suite crashed:', err);
  process.exit(1);
});
