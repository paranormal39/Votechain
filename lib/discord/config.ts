import 'server-only';

// VoteChain Discord bot — server-side configuration + OAuth2 install helpers.
//
// All Discord secrets live here, server-only, and never reach the browser. The
// bot is a hosted multi-tenant app: communities install it via an OAuth2 invite
// link that carries the VoteChain project id in `state`, so `/setup` can bind
// the guild to the right DAO.

export interface DiscordConfig {
  clientId?: string;
  clientSecret?: string;
  botToken?: string;
  /** Application public key (hex) used to verify inbound interaction signatures. */
  publicKey?: string;
  /** Optional guild id to register commands to instantly (dev/testing). */
  devGuildId?: string;
  /** Shared secret for authenticating a standalone gateway worker (optional). */
  internalSecret?: string;
  /** Public base URL the bot deep-links to (e.g. for private voting). */
  appPublicUrl: string;
}

export const discordConfig: DiscordConfig = {
  clientId: process.env.DISCORD_CLIENT_ID || undefined,
  clientSecret: process.env.DISCORD_CLIENT_SECRET || undefined,
  botToken: process.env.DISCORD_BOT_TOKEN || undefined,
  publicKey: process.env.DISCORD_PUBLIC_KEY || undefined,
  devGuildId: process.env.DISCORD_GUILD_ID || undefined,
  internalSecret: process.env.BOT_INTERNAL_SECRET || undefined,
  appPublicUrl: process.env.APP_PUBLIC_URL || 'http://localhost:3000',
};

/** True when the bot application is configured enough to generate an install link. */
export function isDiscordConfigured(): boolean {
  return Boolean(discordConfig.clientId);
}

/** True when the interactions endpoint can verify and act on inbound commands. */
export function isInteractionsReady(): boolean {
  return Boolean(discordConfig.clientId && discordConfig.publicKey && discordConfig.botToken);
}

// Permissions the bot needs once installed:
//   MANAGE_ROLES        (1 << 28) — grant/revoke the verified-member role
//   VIEW_CHANNEL        (1 << 10) — read channels it operates in
//   SEND_MESSAGES       (1 << 11) — post proposal/vote replies + announcements
const BOT_PERMISSIONS = ((1 << 28) | (1 << 10) | (1 << 11)).toString();

/**
 * Build the OAuth2 install URL for a specific project. The `state` carries the
 * project id so the install flow / `/setup` can bind the guild to this DAO.
 * Returns null when the bot application is not configured.
 */
export function buildInviteUrl(projectId: string): string | null {
  if (!discordConfig.clientId) return null;
  const params = new URLSearchParams({
    client_id: discordConfig.clientId,
    scope: 'bot applications.commands',
    permissions: BOT_PERMISSIONS,
    state: projectId,
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}
