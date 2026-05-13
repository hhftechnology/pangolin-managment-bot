// commands/crowdsecBouncers.js
const { SlashCommandBuilder } = require("discord.js");
const dockerManager = require("../backend/dockerManager");
const branding = require('../backend/pangolinBranding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("crowdsecbouncers")
    .setDescription("Manage CrowdSec bouncers")
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List registered bouncers'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a new bouncer')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Name for the bouncer')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('key')
            .setDescription('API key for the bouncer (leave empty for auto-generated)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Delete a bouncer')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Name of the bouncer to delete')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('prune')
        .setDescription('Prune unused bouncers')
        .addStringOption(option =>
          option.setName('duration')
            .setDescription('Minimum idle time (e.g., 24h, 7d)')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('force')
            .setDescription('Force prune without confirmation')
            .setRequired(false))),

  async execute(interaction) {
    console.log(`Executing crowdsecbouncers command from user ${interaction.user.tag}`);

    try {
      await interaction.deferReply().catch(error => {
        console.error('Error deferring reply:', error);
      });

      // Determine which subcommand was invoked
      let subcommand;
      try {
        subcommand = interaction.options.getSubcommand();
        console.log(`Processing subcommand: ${subcommand}`);
      } catch (error) {
        console.log('No subcommand provided, showing help message');

        // Show help message for available subcommands
        const embed = branding.getHeaderEmbed('CrowdSec Bouncers', 'crowdsec');
        embed.setDescription(`${branding.emojis.crowdsec} Please select one of these subcommands:`);

        const subcommands = [
          { name: 'list', description: 'List registered bouncers' },
          { name: 'add', description: 'Register a new bouncer' },
          { name: 'delete', description: 'Delete a registered bouncer' },
          { name: 'prune', description: 'Clean up inactive bouncers' }
        ];

        const formattedSubcommands = subcommands.map(cmd =>
          `**/${interaction.commandName} ${cmd.name}** - ${cmd.description}`
        ).join('\n');

        embed.addFields({ name: 'Available Subcommands', value: formattedSubcommands });

        await interaction.editReply({ embeds: [embed] }).catch(error => {
          console.error('Error sending help message:', error);
        });
        return;
      }

      // Check if CrowdSec container is running
      console.log('Checking CrowdSec container status');
      const containerStatus = await dockerManager.getContainerDetailedStatus('crowdsec').catch(error => {
        console.error('Error checking container status:', error);
        throw new Error(`Failed to check CrowdSec container: ${error.message}`);
      });

      if (!containerStatus.success) {
        throw new Error(`Failed to check CrowdSec container: ${containerStatus.error || "Unknown error"}`);
      }

      if (!containerStatus.exists) {
        throw new Error('CrowdSec container not found');
      }

      if (!containerStatus.running) {
        throw new Error('CrowdSec container is not running');
      }

      // Create embed with branding
      const embed = branding.getHeaderEmbed(`CrowdSec Bouncers - ${subcommand}`, 'crowdsec');
      embed.setDescription(`${branding.emojis.loading} Processing CrowdSec bouncers command...`);
      await interaction.editReply({ embeds: [embed] }).catch(error => {
        console.error('Error updating embed:', error);
      });

      // Handle subcommands
      if (subcommand === 'list') {
        console.log('Executing list subcommand');

        // Build command
        const cmd = ['cscli', 'bouncers', 'list', '-o', 'json'];
        console.log('Executing command:', cmd.join(' '));

        // Execute command
        let result = await dockerManager.executeInContainer('crowdsec', cmd).catch(error => {
          console.error('Error executing command:', error);
          // Return a mock failure result so we can handle it below
          return { success: false, error: error.message };
        });

        // Handle specific known error cases where output might be in stderr or it's a false positive
        if (!result.success) {
          // If we switched to JSON, sometimes empty lists return null or empty stdout with warnings in stderr
          // We can't recover data if stdout is empty, but "Received one or more errors" suggests failure.
          // However, let's assume if it fails we just report the error unless we can decipher it.

          // If the error is just warnings but we got no stdout, it might mean 0 bouncers?
          // Unsafe to assume. But we can present the error more nicely.
          throw new Error(`Failed to list bouncers: ${result.error || "Unknown error"}`);
        }

        // Process output content
        // Process output content
        let outputContent = '';
        try {
          // Try to parse JSON output
          let bouncers = [];

          const trimmedOutput = (result.stdout || '').trim();
          if (trimmedOutput && trimmedOutput !== 'null') {
            bouncers = JSON.parse(result.stdout);
          }

          if (!bouncers || !Array.isArray(bouncers) || bouncers.length === 0) {
            outputContent = 'No registered bouncers found.';
          } else {
            // Define headers matching the image request
            const headers = ['Name', 'IP Address', 'Valid', 'Last API pull', 'Type', 'Version', 'Auth Type'];

            // Helper for padding
            const pad = (str, len) => (str || '').toString().padEnd(len);

            // Transform data to rows
            const rows = bouncers.map(b => {
              return [
                (b.name || '').toString(),
                (b.ip_address || '').toString(),
                (b.revoked ? '✘' : '✔'), // Using checks/crosses like image often has, or keep simple
                (b.last_pull || '').toString(),
                (b.type || '').toString(),
                (b.version || '').toString(),
                (b.auth_type || 'api-key').toString()
              ];
            });

            // Calculate column widths
            const widths = headers.map((h, i) => {
              const maxContent = Math.max(...rows.map(r => r[i].length));
              return Math.max(h.length, maxContent);
            });

            // Build table
            const headerRow = headers.map((h, i) => pad(h, widths[i])).join('  ');
            // Using simple separator line
            const separatorRow = headers.map((_, i) => '-'.repeat(widths[i])).join('  ');
            const dataRows = rows.map(row => row.map((cell, i) => pad(cell, widths[i])).join('  '));

            outputContent = [headerRow, separatorRow, ...dataRows].join('\n');
          }
        } catch (error) {
          console.error('Error parsing bouncers JSON:', error);
          // Fallback to raw output if parsing fails
          outputContent = result.stdout || 'No registered bouncers found.';
        }

        // Update embed to show success
        embed.setColor(branding.colors.info);
        embed.setDescription(`${branding.emojis.crowdsec}  CrowdSec Bouncers.`);

        // Add explanation of what collections are
        embed.addFields({
          name: 'What Are Bouncers?',
          value: 'CrowdSec is composed of different components that communicate via a Local API. To access this API, the various components (CrowdSec agent, cscli and bouncers) need to be authenticated.'
        });

        // Send the decisions list as a file attachment
        if (outputContent.trim() !== '') {
          await interaction.editReply({
            embeds: [embed],
            files: [{
              attachment: Buffer.from(outputContent),
              name: `crowdsec-bouncers-list.txt`
            }]
          });
        } else {
          await interaction.editReply({ embeds: [embed] });
        }

      } else if (subcommand === 'add') {
        console.log('Executing add subcommand');
        const name = interaction.options.getString('name');
        const key = interaction.options.getString('key');

        // Build command
        const cmd = ['cscli', 'bouncers', 'add', name];

        // if (key) cmd.push('--key', key);
        // else cmd.push('--auto');

        // Update embed description
        embed.setDescription(`${branding.emojis.loading} Adding CrowdSec bouncer: ${name}...`);
        await interaction.editReply({ embeds: [embed] }).catch(error => {
          console.error('Error updating embed:', error);
        });

        console.log('Executing command:', cmd.join(' '));

        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd).catch(error => {
          console.error('Error executing command:', error);
          throw new Error(`Failed to add bouncer: ${error.message}`);
        });

        if (!result.success) {
          throw new Error(`Failed to add bouncer: ${result.error || "Unknown error"}`);
        }

        // Update embed
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} Successfully added bouncer: ${name}`);

        // Find API key in the output
        let apiKey = '';
        if (result.stdout && result.stdout.includes('API key')) {
          const apiKeyMatch = result.stdout.match(/API key: ([a-zA-Z0-9]+)/);
          if (apiKeyMatch && apiKeyMatch[1]) {
            apiKey = apiKeyMatch[1];
          }
        }

        if (apiKey) {
          embed.addFields({
            name: 'API Key',
            value: `\`${apiKey}\`\n*Save this key! It will not be shown again.*`
          });
        }

        if (result.stdout) {
          // Remove sensitive information from output
          let sanitizedOutput = result.stdout;
          if (apiKey) {
            sanitizedOutput = sanitizedOutput.replace(new RegExp(apiKey, 'g'), '[REDACTED]');
          }

          embed.addFields({ name: 'Output', value: '```\n' + sanitizedOutput + '\n```' });
        }

      } else if (subcommand === 'delete') {
        console.log('Executing delete subcommand');
        const name = interaction.options.getString('name');

        // Build command
        const cmd = ['cscli', 'bouncers', 'delete', name];

        // Update embed description
        embed.setDescription(`${branding.emojis.loading} Deleting CrowdSec bouncer: ${name}...`);
        await interaction.editReply({ embeds: [embed] }).catch(error => {
          console.error('Error updating embed:', error);
        });

        console.log('Executing command:', cmd.join(' '));

        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd).catch(error => {
          console.error('Error executing command:', error);
          throw new Error(`Failed to delete bouncer: ${error.message}`);
        });

        if (!result.success) {
          throw new Error(`Failed to delete bouncer: ${result.error || "Unknown error"}`);
        }

        // Update embed
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} Successfully deleted bouncer: ${name}`);

        if (result.stdout && result.stdout.trim() !== '') {
          embed.addFields({ name: 'Output', value: '```\n' + result.stdout + '\n```' });
        }

      } else if (subcommand === 'prune') {
        console.log('Executing prune subcommand');
        const duration = interaction.options.getString('duration') || '24h';
        const force = interaction.options.getBoolean('force');

        // Build command
        const cmd = ['cscli', 'bouncers', 'prune'];

        if (duration) cmd.push('-d', duration);
        if (force) cmd.push('--force');

        // Update embed description
        embed.setDescription(`${branding.emojis.loading} Pruning inactive CrowdSec bouncers...`);
        await interaction.editReply({ embeds: [embed] }).catch(error => {
          console.error('Error updating embed:', error);
        });

        console.log('Executing command:', cmd.join(' '));

        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd).catch(error => {
          console.error('Error executing command:', error);
          throw new Error(`Failed to prune bouncers: ${error.message}`);
        });

        // For non-force mode, the command will ask for confirmation,
        // which we can't provide in this context. Let the user know.
        if (!force && result.stderr && result.stderr.includes('Are you sure')) {
          embed.setColor(branding.colors.warning);
          embed.setDescription(`${branding.emojis.warning} Pruning requires confirmation.`);
          embed.addFields({
            name: 'How to Proceed',
            value: 'Run the command with the `force` option enabled:\n`/crowdsecbouncers prune duration:' + duration + ' force:true`'
          });

          if (result.stderr) {
            embed.addFields({ name: 'Details', value: '```\n' + result.stderr + '\n```' });
          }
        } else if (!result.success) {
          throw new Error(`Failed to prune bouncers: ${result.error || "Unknown error"}`);
        } else {
          // Update embed
          embed.setColor(branding.colors.success);
          embed.setDescription(`${branding.emojis.healthy} Successfully pruned inactive bouncers.`);

          if (result.stdout && result.stdout.trim() !== '') {
            embed.addFields({ name: 'Output', value: '```\n' + result.stdout + '\n```' });
          }
        }
      } else {
        throw new Error(`Unknown subcommand: ${subcommand}`);
      }

      await interaction.editReply({ embeds: [embed] }).catch(error => {
        console.error('Error sending final response:', error);
      });

    } catch (error) {
      console.error('Error executing crowdsecBouncers command:', error);

      try {
        // Create error embed with branding
        const errorEmbed = branding.getHeaderEmbed('Error Managing CrowdSec Bouncers', 'danger');
        errorEmbed.setDescription(`${branding.emojis.error} An error occurred:\n\`\`\`${error.message}\`\`\``);

        // Check if interaction has already been replied to
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ embeds: [errorEmbed] }).catch(e => {
            console.error('Failed to send error message:', e);
          });
        } else {
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true }).catch(e => {
            console.error('Failed to send error message:', e);
          });
        }
      } catch (embedError) {
        console.error('Failed to create error embed:', embedError);
      }
    }
  }
};