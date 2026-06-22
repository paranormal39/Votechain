import 'server-only';

// Minimal Discord REST helpers used outside the interaction request/response
// cycle (e.g. posting a follow-up after an async Xaman webhook resolves).

const DISCORD_API = 'https://discord.com/api/v10';
const EPHEMERAL = 1 << 6;

/**
 * Post a follow-up message to an interaction using its token. No bot auth is
 * required — the interaction token authorizes the follow-up. The token is valid
 * for ~15 minutes after the original interaction.
 */
export async function sendInteractionFollowup(
  applicationId: string,
  interactionToken: string,
  content: string,
  ephemeral = true
): Promise<void> {
  try {
    await fetch(`${DISCORD_API}/webhooks/${applicationId}/${interactionToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, ...(ephemeral ? { flags: EPHEMERAL } : {}) }),
    });
  } catch (err) {
    console.warn('[discord/rest] follow-up failed:', err);
  }
}
