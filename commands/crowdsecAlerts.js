// commands/crowdsecAlerts.js
const { SlashCommandBuilder } = require("discord.js");
const dockerManager = require("../backend/dockerManager");
const branding = require('../backend/pangolinBranding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("crowdsecalerts")
    .setDescription("Manage CrowdSec alerts")
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List active alerts')
        .addStringOption(option =>
          option.setName('ip')
            .setDescription('Restrict to alerts from this IP')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('range')
            .setDescription('Restrict to alerts from this range (e.g., 1.2.3.0/24)')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('scenario')
            .setDescription('Filter by scenario (e.g., crowdsecurity/ssh-bf)')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('type')
            .setDescription('Filter by decision type (e.g., ban, captcha)')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('since')
            .setDescription('Show alerts newer than duration (e.g., 4h, 30d)')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('until')
            .setDescription('Show alerts older than duration (e.g., 4h, 30d)')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('all')
            .setDescription('Include decisions from Central API')
            .setRequired(false))
        .addIntegerOption(option =>
          option.setName('limit')
            .setDescription('Limit size of alerts list (0 to view all alerts)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('flush')
        .setDescription('Flush alerts from the database')
        .addIntegerOption(option =>
          option.setName('max_items')
            .setDescription('Maximum number of alert items to keep in the database')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('max_age')
            .setDescription('Maximum age of alert items to keep in the database (e.g., 7d)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('inspect')
        .setDescription('Inspect a specific alert')
        .addStringOption(option =>
          option.setName('alert_id')
            .setDescription('Alert ID to inspect')
            .setRequired(true))
        .addBooleanOption(option =>
          option.setName('details')
            .setDescription('Show alerts with events')
            .setRequired(false))),

  async execute(interaction) {
    console.log(`Executing crowdsecalerts command from user ${interaction.user.tag}`);

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
        const embed = branding.getHeaderEmbed('CrowdSec Alerts', 'crowdsec');
        embed.setDescription(`${branding.emojis.crowdsec} Please select one of these subcommands:`);

        const subcommands = [
          { name: 'list', description: 'List active alerts in the system' },
          { name: 'flush', description: 'Clean up old alerts from the database' },
          { name: 'inspect', description: 'View detailed information about a specific alert' }
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
      const embed = branding.getHeaderEmbed(`CrowdSec Alerts - ${subcommand}`, 'crowdsec');

      // Handle subcommands
      if (subcommand === 'list') {
        console.log('Executing list subcommand');
        embed.setDescription(`${branding.emojis.loading} Fetching CrowdSec alerts...`);
        await interaction.editReply({ embeds: [embed] }).catch(error => {
          console.error('Error updating embed:', error);
        });

        // Build command arguments
        const cmd = ['cscli', 'alerts', 'list'];

        // Add options if provided
        const ip = interaction.options.getString('ip');
        const range = interaction.options.getString('range');
        const scenario = interaction.options.getString('scenario');
        const type = interaction.options.getString('type');
        const since = interaction.options.getString('since');
        const until = interaction.options.getString('until');
        const all = interaction.options.getBoolean('all');
        const limit = interaction.options.getInteger('limit');

        if (ip) cmd.push('--ip', ip);
        if (range) cmd.push('--range', range);
        if (scenario) cmd.push('--scenario', scenario);
        if (type) cmd.push('--type', type);
        if (since) cmd.push('--since', since);
        if (until) cmd.push('--until', until);
        if (all) cmd.push('--all');
        if (limit) cmd.push('--limit', limit.toString());

        console.log('Executing command:', cmd.join(' '));

        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd).catch(error => {
          console.error('Error executing command:', error);
          throw new Error(`Failed to list alerts: ${error.message}`);
        });

        if (!result.success) {
          throw new Error(`Failed to list alerts: ${result.error || "Unknown error"}`);
        }

        // Create summary embed
        const summaryEmbed = branding.getHeaderEmbed('CrowdSec Alerts', 'crowdsec');
        summaryEmbed.setDescription(`${branding.emojis.crowdsec} CrowdSec Alerts`);

        // Add explanation of what collections are
        summaryEmbed.addFields({
          name: 'What Are Alerts?',
          value: 'CrowdSec  Alerts are events that are detected by the CrowdSec agent and are stored in the CrowdSec database. These alerts can be used to monitor the security of your system and to take action when necessary.'
        });

        // Add filter details if any were applied
        const filterDetails = [];
        if (ip) filterDetails.push(`IP: ${ip}`);
        if (range) filterDetails.push(`Range: ${range}`);
        if (scenario) filterDetails.push(`Scenario: ${scenario}`);
        if (type) filterDetails.push(`Type: ${type}`);
        if (since) filterDetails.push(`Since: ${since}`);
        if (until) filterDetails.push(`Until: ${until}`);

        if (filterDetails.length > 0) {
          summaryEmbed.addFields({ name: 'Filters Applied', value: filterDetails.join('\n') });
        }

        // Get the output content
        const alertsContent = result.stdout || 'No alerts found.';

        // Check if content is empty
        if (alertsContent.trim() === 'No alerts found.') {
          summaryEmbed.addFields({ name: 'Results', value: 'No alerts found matching your criteria.' });
          await interaction.editReply({ embeds: [summaryEmbed] });
        } else {
          // Send the alerts list as a file attachment
          await interaction.editReply({
            embeds: [summaryEmbed],
            files: [{
              attachment: Buffer.from(alertsContent),
              name: `crowdsec-alerts.txt`
            }]
          });
        }

      } else if (subcommand === 'flush') {
        console.log('Executing flush subcommand');
        embed.setDescription(`${branding.emojis.loading} Flushing CrowdSec alerts...`);
        await interaction.editReply({ embeds: [embed] }).catch(error => {
          console.error('Error updating embed:', error);
        });

        // Build command arguments
        const cmd = ['cscli', 'alerts', 'flush'];

        const maxItems = interaction.options.getInteger('max_items');
        const maxAge = interaction.options.getString('max_age');

        if (maxItems) cmd.push('--max-items', maxItems.toString());
        if (maxAge) cmd.push('--max-age', maxAge);

        console.log('Executing command:', cmd.join(' '));

        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd).catch(error => {
          console.error('Error executing command:', error);
          throw new Error(`Failed to flush alerts: ${error.message}`);
        });

        if (!result.success) {
          throw new Error(`Failed to flush alerts: ${result.error || "Unknown error"}`);
        }

        // Update embed
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} CrowdSec alerts flushed successfully.`);

        const outputContent = result.stdout || 'Operation completed successfully.';

        // Send the output as a file attachment if there's meaningful content
        if (outputContent.trim() !== '') {
          await interaction.editReply({
            embeds: [embed],
            files: [{
              attachment: Buffer.from(outputContent),
              name: `crowdsec-flush-result.txt`
            }]
          });
        } else {
          await interaction.editReply({ embeds: [embed] });
        }

      } else if (subcommand === 'inspect') {
        console.log('Executing inspect subcommand');
        const alertId = interaction.options.getString('alert_id');
        const showDetails = interaction.options.getBoolean('details');

        embed.setDescription(`${branding.emojis.loading} Inspecting alert ID: ${alertId}...`);
        await interaction.editReply({ embeds: [embed] }).catch(error => {
          console.error('Error updating embed:', error);
        });

        // Build command
        const cmd = ['cscli', 'alerts', 'inspect', alertId];
        if (showDetails) cmd.push('--details');

        console.log('Executing command:', cmd.join(' '));

        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd).catch(error => {
          console.error('Error executing command:', error);
          throw new Error(`Failed to inspect alert: ${error.message}`);
        });

        if (!result.success) {
          throw new Error(`Failed to inspect alert: ${result.error || "Unknown error"}`);
        }

        // Create summary embed
        const inspectEmbed = branding.getHeaderEmbed(`CrowdSec Alert Inspection: ID ${alertId}`, 'crowdsec');
        inspectEmbed.setDescription(`${branding.emojis.crowdsec} Alert ID: ${alertId} inspection results${showDetails ? ' (with details)' : ''}`);

        // Get the output content
        const inspectContent = result.stdout || 'No alert details found.';

        // Send the inspection results as a file attachment
        await interaction.editReply({
          embeds: [inspectEmbed],
          files: [{
            attachment: Buffer.from(inspectContent),
            name: `crowdsec-alert-${alertId}.txt`
          }]
        });
      } else {
        throw new Error(`Unknown subcommand: ${subcommand}`);
      }

    } catch (error) {
      console.error('Error executing crowdsecAlerts command:', error);

      try {
        // Create error embed with branding
        const errorEmbed = branding.getHeaderEmbed('Error Managing CrowdSec Alerts', 'danger');
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