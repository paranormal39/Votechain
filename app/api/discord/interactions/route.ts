import { discordConfig, isInteractionsReady } from '@/lib/discord/config';
import { verifyDiscordSignature } from '@/lib/discord/verify';
import { handleInteraction } from '@/lib/discord/interactions';

// Discord delivers slash commands here as signed HTTP POSTs. We must:
//   1. read the RAW body (signature is over timestamp + raw body),
//   2. verify the Ed25519 signature against our app public key,
//   3. answer PINGs and dispatch commands.
// node runtime is required because verification uses node:crypto.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EPHEMERAL = 1 << 6;

export async function POST(request: Request) {
  if (!isInteractionsReady()) {
    return new Response('Discord interactions are not configured on this server.', { status: 503 });
  }

  const signature = request.headers.get('x-signature-ed25519') ?? '';
  const timestamp = request.headers.get('x-signature-timestamp') ?? '';
  const rawBody = await request.text();

  const valid = verifyDiscordSignature(discordConfig.publicKey as string, signature, timestamp, rawBody);
  if (!valid) {
    return new Response('invalid request signature', { status: 401 });
  }

  let interaction: unknown;
  try {
    interaction = JSON.parse(rawBody);
  } catch {
    return new Response('invalid JSON body', { status: 400 });
  }

  try {
    const result = await handleInteraction(interaction as never);
    return Response.json(result);
  } catch (err) {
    console.error('[discord/interactions] handler error:', err);
    // Always return a valid interaction response so Discord surfaces a message.
    return Response.json({
      type: 4,
      data: { content: 'Something went wrong handling that command. Please try again.', flags: EPHEMERAL },
    });
  }
}
