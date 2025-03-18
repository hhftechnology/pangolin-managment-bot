// commands/crowdsecDecisions.js
const { SlashCommandBuilder } = require("discord.js");
const dockerManager = require("../backend/dockerManager");
const branding = require('../backend/pangolinBranding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("crowdsecdecisions")
    .setDescription("Manage CrowdSec decisions (bans, captchas, etc.)")
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List active decisions')
        .addStringOption(option =>
          option.setName('ip')
            .setDescription('Restrict to decisions for this IP')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('range')
            .setDescription('Restrict to decisions for this range (e.g., 1.2.3.0/24)')
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
          option.setName('scope')
            .setDescription('Restrict to decisions with this scope (e.g., ip, range)')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('value')
            .setDescription('The value to match for in the specified scope')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('all')
            .setDescription('Include decisions from Central API')
            .setRequired(false))
        .addIntegerOption(option =>
          option.setName('limit')
            .setDescription('Limit size of decisions list (0 to view all)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a new decision')
        .addStringOption(option =>
          option.setName('type')
            .setDescription('Decision type')
            .setRequired(true)
            .addChoices(
              { name: 'ban', value: 'ban' },
              { name: 'captcha', value: 'captcha' },
              { name: 'whitelist', value: 'whitelist' }
            ))
        .addStringOption(option =>
          option.setName('value')
            .setDescription('Target value (IP, range, username)')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('scope')
            .setDescription('Decision scope')
            .setRequired(false)
            .addChoices(
              { name: 'ip', value: 'ip' },
              { name: 'range', value: 'range' },
              { name: 'username', value: 'username' }
            ))
        .addStringOption(option =>
          option.setName('duration')
            .setDescription('Decision duration (e.g., 4h, 24h, 7d)')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('reason')
            .setDescription('Reason for the decision')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Delete decisions')
        .addStringOption(option =>
          option.setName('ip')
            .setDescription('IP address to unban')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('range')
            .setDescription('IP range to unban (e.g., 1.2.3.0/24)')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('id')
            .setDescription('Decision ID to delete')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('type')
            .setDescription('Decision type to delete')
            .setRequired(false)
            .addChoices(
              { name: 'ban', value: 'ban' },
              { name: 'captcha', value: 'captcha' },
              { name: 'whitelist', value: 'whitelist' }
            ))
        .addStringOption(option =>
          option.setName('scope')
            .setDescription('Decision scope to delete')
            .setRequired(false)
            .addChoices(
              { name: 'ip', value: 'ip' },
              { name: 'range', value: 'range' },
              { name: 'username', value: 'username' }
            ))
        .addStringOption(option =>
          option.setName('value')
            .setDescription('The value to match for the specified scope')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('import')
        .setDescription('Import decisions from a file (admin only)')),
        
  async execute(interaction) {
    console.log(`Executing crowdsecdecisions command from user ${interaction.user.tag}`);
    
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
        const embed = branding.getHeaderEmbed('CrowdSec Decisions', 'crowdsec');
        embed.setDescription(`${branding.emojis.crowdsec} Please select one of these subcommands:`);
        
        const subcommands = [
          { name: 'list', description: 'List active decisions (bans, captchas, etc.)' },
          { name: 'add', description: 'Add a new decision (ban or whitelist an IP/range)' },
          { name: 'delete', description: 'Delete decisions to remove bans/whitelists' },
          { name: 'import', description: 'Import decisions from a file (admin only)' }
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
      const embed = branding.getHeaderEmbed(`CrowdSec Decisions - ${subcommand}`, 'crowdsec');
      embed.setDescription(`${branding.emojis.loading} Processing CrowdSec decisions command...`);
      await interaction.editReply({ embeds: [embed] }).catch(error => {
        console.error('Error updating embed:', error);
      });
      
      // Handle subcommands
      if (subcommand === 'list') {
        console.log('Executing list subcommand');
        
        // Build command arguments
        const cmd = ['cscli', 'decisions', 'list'];
        
        // Add options if provided
        const ip = interaction.options.getString('ip');
        const range = interaction.options.getString('range');
        const scenario = interaction.options.getString('scenario');
        const type = interaction.options.getString('type');
        const scope = interaction.options.getString('scope');
        const value = interaction.options.getString('value');
        const all = interaction.options.getBoolean('all');
        const limit = interaction.options.getInteger('limit');
        
        if (ip) cmd.push('--ip', ip);
        if (range) cmd.push('--range', range);
        if (scenario) cmd.push('--scenario', scenario);
        if (type) cmd.push('--type', type);
        if (scope) cmd.push('--scope', scope);
        if (value) cmd.push('--value', value);
        if (all) cmd.push('--all');
        if (limit) cmd.push('--limit', limit.toString());
        
        console.log('Executing command:', cmd.join(' '));
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd).catch(error => {
          console.error('Error executing command:', error);
          throw new Error(`Failed to list decisions: ${error.message}`);
        });
        
        if (!result.success) {
          throw new Error(`Failed to list decisions: ${result.error || "Unknown error"}`);
        }
        
        // Create summary embed
        const summaryEmbed = branding.getHeaderEmbed('CrowdSec Active Decisions', 'crowdsec');
        summaryEmbed.setDescription(`${branding.emojis.crowdsec} CrowdSec Active Decisions`);
        
        // Add filter details if any were applied
        const filterDetails = [];
        if (ip) filterDetails.push(`IP: ${ip}`);
        if (range) filterDetails.push(`Range: ${range}`);
        if (scenario) filterDetails.push(`Scenario: ${scenario}`);
        if (type) filterDetails.push(`Type: ${type}`);
        if (scope) filterDetails.push(`Scope: ${scope}`);
        if (value) filterDetails.push(`Value: ${value}`);
        
        if (filterDetails.length > 0) {
          summaryEmbed.addFields({ name: 'Filters Applied', value: filterDetails.join('\n') });
        }
        
        // Get the output content
        const decisionsContent = result.stdout || 'No active decisions found.';
        
        // Send the decisions list as a file attachment
        await interaction.editReply({
          embeds: [summaryEmbed],
          files: [{
            attachment: Buffer.from(decisionsContent),
            name: `crowdsec-decisions.txt`
          }]
        });
        
      } else if (subcommand === 'add') {
        console.log('Executing add subcommand');
        
        // Get options
        const type = interaction.options.getString('type');
        const value = interaction.options.getString('value');
        const scope = interaction.options.getString('scope') || 'ip';
        const duration = interaction.options.getString('duration') || '24h';
        const reason = interaction.options.getString('reason') || 'manual';
        
        // Determine if this is an IP or a range
        const isRange = value.includes('/');
        
        // Build command
        let cmd;
        if (scope === 'range' || isRange) {
          cmd = ['cscli', 'decisions', 'add', '--range', value, '--type', type];
        } else if (scope === 'ip' && !isRange) {
          cmd = ['cscli', 'decisions', 'add', '--ip', value, '--type', type];
        } else {
          cmd = ['cscli', 'decisions', 'add', '--scope', scope, '--value', value, '--type', type];
        }
        
        if (duration) cmd.push('--duration', duration);
        if (reason) cmd.push('--reason', reason);
        
        // Update embed description
        embed.setDescription(`${branding.emojis.loading} Adding CrowdSec decision: ${type} for ${scope}:${value}...`);
        await interaction.editReply({ embeds: [embed] }).catch(error => {
          console.error('Error updating embed:', error);
        });
        
        console.log('Executing command:', cmd.join(' '));
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd).catch(error => {
          console.error('Error executing command:', error);
          throw new Error(`Failed to add decision: ${error.message}`);
        });
        
        if (!result.success) {
          throw new Error(`Failed to add decision: ${result.error || "Unknown error"}`);
        }
        
        // Update embed
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} Successfully added decision.`);
        
        // Create details string
        const details = [
          `Type: ${type}`,
          `Scope: ${scope}`,
          `Value: ${value}`,
          `Duration: ${duration || '4h (default)'}`,
          `Reason: ${reason || 'manual (default)'}`
        ];
        
        embed.addFields({ name: 'Decision Details', value: details.join('\n') });
        
        const outputContent = result.stdout || 'Operation completed successfully.';
        
        // Send the output as a file attachment if there's meaningful content
        if (outputContent.trim() !== '') {
          await interaction.editReply({
            embeds: [embed],
            files: [{
              attachment: Buffer.from(outputContent),
              name: `crowdsec-add-decision.txt`
            }]
          });
        } else {
          await interaction.editReply({ embeds: [embed] });
        }
        
      } else if (subcommand === 'delete') {
        console.log('Executing delete subcommand');
        
        // Get options
        const ip = interaction.options.getString('ip');
        const range = interaction.options.getString('range');
        const id = interaction.options.getString('id');
        const type = interaction.options.getString('type');
        const scope = interaction.options.getString('scope');
        const value = interaction.options.getString('value');
        
        // Build command
        const cmd = ['cscli', 'decisions', 'delete'];
        
        // Ensure at least one filter is provided
        if (!ip && !range && !id && !type && !(scope && value)) {
          throw new Error('At least one filter must be provided to delete decisions');
        }
        
        if (ip) cmd.push('--ip', ip);
        if (range) cmd.push('--range', range);
        if (id) cmd.push('--id', id);
        if (type) cmd.push('--type', type);
        if (scope && value) {
          cmd.push('--scope', scope, '--value', value);
        }
        
        // Update embed description
        embed.setDescription(`${branding.emojis.loading} Deleting CrowdSec decision(s)...`);
        await interaction.editReply({ embeds: [embed] }).catch(error => {
          console.error('Error updating embed:', error);
        });
        
        console.log('Executing command:', cmd.join(' '));
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd).catch(error => {
          console.error('Error executing command:', error);
          throw new Error(`Failed to delete decision(s): ${error.message}`);
        });
        
        if (!result.success) {
          throw new Error(`Failed to delete decision(s): ${result.error || "Unknown error"}`);
        }
        
        // Update embed
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} Successfully deleted decision(s).`);
        
        // Create filter details
        const filterDetails = [];
        if (ip) filterDetails.push(`IP: ${ip}`);
        if (range) filterDetails.push(`Range: ${range}`);
        if (id) filterDetails.push(`ID: ${id}`);
        if (type) filterDetails.push(`Type: ${type}`);
        if (scope && value) filterDetails.push(`${scope}: ${value}`);
        
        if (filterDetails.length > 0) {
          embed.addFields({ name: 'Deleted Decisions Matching', value: filterDetails.join('\n') });
        }
        
        const outputContent = result.stdout || 'Operation completed successfully.';
        
        // Send the output as a file attachment if there's meaningful content
        if (outputContent.trim() !== '') {
          await interaction.editReply({
            embeds: [embed],
            files: [{
              attachment: Buffer.from(outputContent),
              name: `crowdsec-delete-decision.txt`
            }]
          });
        } else {
          await interaction.editReply({ embeds: [embed] });
        }
        
      } else if (subcommand === 'import') {
        console.log('Executing import subcommand');
        
        // This would require file upload capability
        embed.setColor(branding.colors.warning);
        embed.setDescription(`${branding.emojis.warning} Decision import requires file upload, which is not supported in Discord commands.`);
        embed.addFields({ 
          name: 'Alternative Methods', 
          value: 'You can import decisions using the following methods:\n' +
                 '1. SSH into your server and use the command directly\n' +
                 '2. Create a script that reads from a predefined location\n' +
                 '3. Add decisions individually using the `/crowdsecdecisions add` command'
        });
        
        await interaction.editReply({ embeds: [embed] });
      } else {
        throw new Error(`Unknown subcommand: ${subcommand}`);
      }
      
    } catch (error) {
      console.error('Error executing crowdsecDecisions command:', error);
      
      try {
        // Create error embed with branding
        const errorEmbed = branding.getHeaderEmbed('Error Managing CrowdSec Decisions', 'danger');
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