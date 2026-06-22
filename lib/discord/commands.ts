// VoteChain Discord slash-command definitions.
//
// Pure data (no server-only / IO) so it can be imported by both the interactions
// handler and the standalone registration script run with tsx.

// Discord application command option types (subset we use).
const STRING = 3;

// ADMINISTRATOR permission bit, as a string bitfield for default_member_permissions.
const ADMINISTRATOR = '8';

// MANAGE_MESSAGES (1 << 13) — gates the public broadcast command to moderators
// so members can't spam the channel.
const MANAGE_MESSAGES = '8192';

export interface CommandOptionChoice {
  name: string;
  value: string;
}

export interface CommandOption {
  type: number;
  name: string;
  description: string;
  required?: boolean;
  choices?: CommandOptionChoice[];
}

export interface SlashCommand {
  name: string;
  description: string;
  options?: CommandOption[];
  /** Bitfield string gating who can use the command (omit = everyone). */
  default_member_permissions?: string;
  /** Disallow in DMs — these commands are guild-scoped. */
  dm_permission?: boolean;
}

export const COMMANDS: SlashCommand[] = [
  {
    name: 'setup',
    description: 'Bind this Discord server to a VoteChain DAO (admins only).',
    default_member_permissions: ADMINISTRATOR,
    dm_permission: false,
    options: [
      {
        type: STRING,
        name: 'project_id',
        description: 'The VoteChain project/DAO id to bind to this server.',
        required: true,
      },
    ],
  },
  {
    name: 'link',
    description: 'Privately link your wallet (scan a QR to sign in) so you can vote from Discord.',
    dm_permission: false,
    options: [
      {
        type: STRING,
        name: 'wallet',
        description: 'Optional: paste your address instead of scanning the QR (no ownership check).',
        required: false,
      },
    ],
  },
  {
    name: 'proposals',
    description: 'Privately list the active proposals for this server\u2019s DAO.',
    dm_permission: false,
  },
  {
    name: 'proposals-public',
    description: 'Post the active proposals to the channel for all members to see.',
    default_member_permissions: MANAGE_MESSAGES,
    dm_permission: false,
  },
  {
    name: 'vote',
    description: 'Cast a vote on a proposal using your linked wallet.',
    dm_permission: false,
    options: [
      {
        type: STRING,
        name: 'proposal_id',
        description: 'The proposal id (see /proposals).',
        required: true,
      },
      {
        type: STRING,
        name: 'choice',
        description: 'Your vote.',
        required: true,
        choices: [
          { name: 'Yes', value: 'yes' },
          { name: 'No', value: 'no' },
          { name: 'Abstain', value: 'abstain' },
        ],
      },
    ],
  },
];
