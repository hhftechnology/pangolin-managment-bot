// commands/crowdsecWhitelist.js
const { SlashCommandBuilder } = require("discord.js");
const dockerManager = require("../backend/dockerManager");
const branding = require('../backend/pangolinBranding');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("crowdsecallowlist")
    .setDescription("Manage CrowdSec IP allowlists")
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a new allowlist')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Name for the new allowlist')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('description')
            .setDescription('Description for the allowlist')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add an IP or range to allowlist')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Name of the allowlist')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('target')
            .setDescription('IP address or CIDR range to allowlist')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('expiration')
            .setDescription('Expiration time (e.g. 7d, 24h, never)')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('comment')
            .setDescription('Comment for this entry')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all allowlists'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('inspect')
        .setDescription('Inspect contents of a specific allowlist')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Name of the allowlist to inspect')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove an IP or range from allowlist')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Name of the allowlist')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('target')
            .setDescription('IP address or CIDR range to remove')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Delete an entire allowlist')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Name of the allowlist to delete')
            .setRequired(true))),
            
  async execute(interaction) {
    console.log(`Executing crowdsecallowlist command from user ${interaction.user.tag}`);
    
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
        const embed = branding.getHeaderEmbed('CrowdSec AllowList', 'crowdsec');
        embed.setDescription(`${branding.emojis.crowdsec} Please select one of these subcommands:`);
        
        const subcommands = [
          { name: 'create', description: 'Create a new allowlist' },
          { name: 'add', description: 'Add an IP or range to an allowlist' },
          { name: 'list', description: 'List all allowlists' },
          { name: 'inspect', description: 'Inspect contents of a specific allowlist' },
          { name: 'remove', description: 'Remove an IP or range from an allowlist' },
          { name: 'delete', description: 'Delete an entire allowlist' }
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
      const embed = branding.getHeaderEmbed(`CrowdSec AllowList - ${subcommand}`, 'crowdsec');
      embed.setDescription(`${branding.emojis.loading} Processing CrowdSec allowlist command...`);
      await interaction.editReply({ embeds: [embed] }).catch(error => {
        console.error('Error updating embed:', error);
      });
      
      // Handle subcommands using the new allowlists API
      if (subcommand === 'create') {
        console.log('Executing create subcommand');
        const name = interaction.options.getString('name');
        const description = interaction.options.getString('description');
        
        // Update embed description
        embed.setDescription(`${branding.emojis.loading} Creating allowlist "${name}"...`);
        await interaction.editReply({ embeds: [embed] }).catch(error => {
          console.error('Error updating embed:', error);
        });
        
        // Execute command to create allowlist
        const cmd = ['cscli', 'allowlists', 'create', name, '--description', description];
        console.log('Executing command:', cmd.join(' '));
        
        const result = await dockerManager.executeInContainer('crowdsec', cmd).catch(error => {
          console.error('Error executing command:', error);
          throw new Error(`Failed to create allowlist: ${error.message}`);
        });
        
        if (!result.success) {
          throw new Error(`Failed to create allowlist: ${result.error || "Unknown error"}`);
        }
        
        // Update embed
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} Successfully created allowlist "${name}".`);
        
        // Create details string
        const details = [
          `Name: ${name}`,
          `Description: ${description}`
        ];
        
        embed.addFields({ name: 'Allowlist Details', value: details.join('\n') });
        
        if (result.stdout && result.stdout.trim() !== '') {
          embed.addFields({ name: 'Output', value: '```\n' + result.stdout + '\n```' });
        }
        
      } else if (subcommand === 'add') {
        console.log('Executing add subcommand');
        const name = interaction.options.getString('name');
        const target = interaction.options.getString('target');
        const expiration = interaction.options.getString('expiration') || 'never';
        const comment = interaction.options.getString('comment');
        
        // Determine if this is an IP or a range
        const isRange = target.includes('/');
        console.log(`Adding ${isRange ? 'range' : 'IP'}: ${target} to allowlist: ${name}`);
        
        // Build command to add to allowlist
        let cmd = ['cscli', 'allowlists', 'add', name, target];
        
        // Add expiration if provided and not 'never'
        if (expiration && expiration !== 'never') {
          cmd.push('-e', expiration);
        }
        
        // Add comment if provided
        if (comment) {
          cmd.push('-d', comment);
        }
        
        // Update embed description
        embed.setDescription(`${branding.emojis.loading} Adding ${isRange ? 'range' : 'IP'} ${target} to allowlist "${name}"...`);
        await interaction.editReply({ embeds: [embed] }).catch(error => {
          console.error('Error updating embed:', error);
        });
        
        console.log('Executing command:', cmd.join(' '));
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd).catch(error => {
          console.error('Error executing command:', error);
          throw new Error(`Failed to add to allowlist: ${error.message}`);
        });
        
        if (!result.success) {
          throw new Error(`Failed to add to allowlist: ${result.error || "Unknown error"}`);
        }
        
        // Update embed
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} Successfully added ${isRange ? 'range' : 'IP'} to allowlist.`);
        
        // Create details string
        const details = [
          `Allowlist: ${name}`,
          `Target: ${target}`,
          `Type: ${isRange ? 'Range' : 'IP address'}`,
          `Expiration: ${expiration}`,
          comment ? `Comment: ${comment}` : 'No comment provided'
        ];
        
        embed.addFields({ name: 'Entry Details', value: details.join('\n') });
        
        if (result.stdout && result.stdout.trim() !== '') {
          embed.addFields({ name: 'Output', value: '```\n' + result.stdout + '\n```' });
        }
        
      } else if (subcommand === 'list') {
        console.log('Executing list subcommand');
        
        // List all allowlists
        const cmd = ['cscli', 'allowlists', 'list', '-o', 'json'];
        console.log('Executing command:', cmd.join(' '));
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd).catch(error => {
          console.error('Error executing command:', error);
          throw new Error(`Failed to list allowlists: ${error.message}`);
        });
        
        if (!result.success) {
          throw new Error(`Failed to list allowlists: ${result.error || "Unknown error"}`);
        }
        
        // Try to parse JSON output
        let allowlists = [];
        try {
          if (result.stdout && result.stdout.trim() !== '') {
            allowlists = JSON.parse(result.stdout);
          }
        } catch (parseError) {
          console.error('Error parsing JSON output:', parseError);
          throw new Error(`Failed to parse allowlists output: ${parseError.message}`);
        }
        
        // Format the output
        let formattedOutput = 'No allowlists found.';
        if (allowlists.length > 0) {
          // Create a formatted table-like string
          const tableRows = allowlists.map(list => 
            `${list.name.padEnd(20)} | ${list.description.substring(0, 30).padEnd(30)} | ${list.created_at}`
          );
          
          formattedOutput = '```\n' + 
            'Name                 | Description                      | Created At\n' +
            '-------------------- | -------------------------------- | --------------------\n' +
            tableRows.join('\n') + 
            '\n```';
        }
        
        // Update embed
        embed.setDescription(`${branding.emojis.crowdsec} CrowdSec AllowLists`);
        embed.addFields({ name: 'Available AllowLists', value: formattedOutput });
        
        // Add usage instructions
        embed.addFields({ 
          name: 'Usage Instructions', 
          value: 'To view the contents of a specific allowlist, use:\n' +
                 `\`/${interaction.commandName} inspect <name>\``
        });
        
      } else if (subcommand === 'inspect') {
        console.log('Executing inspect subcommand');
        const name = interaction.options.getString('name');
        
        // Inspect the specific allowlist
        const cmd = ['cscli', 'allowlists', 'inspect', name];
        console.log('Executing command:', cmd.join(' '));
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd).catch(error => {
          console.error('Error executing command:', error);
          throw new Error(`Failed to inspect allowlist: ${error.message}`);
        });
        
        if (!result.success) {
          throw new Error(`Failed to inspect allowlist: ${result.error || "Unknown error"}`);
        }
        
        // Format the output
        let formattedOutput = 'Allowlist is empty or does not exist.';
        if (result.stdout && result.stdout.trim() !== '') {
          formattedOutput = '```\n' + result.stdout + '\n```';
          
          // If output is too long, truncate it
          if (formattedOutput.length > 4000) {
            formattedOutput = '```\n' + result.stdout.substring(0, 3900) + '\n...\n(Output truncated due to size limits)\n```';
          }
        }
        
        // Update embed
        embed.setDescription(`${branding.emojis.crowdsec} CrowdSec AllowList: ${name}`);
        embed.addFields({ name: 'Allowlist Content', value: formattedOutput });
        
      } else if (subcommand === 'remove') {
        console.log('Executing remove subcommand');
        const name = interaction.options.getString('name');
        const target = interaction.options.getString('target');
        
        // Determine if this is an IP or a range
        const isRange = target.includes('/');
        console.log(`Removing ${isRange ? 'range' : 'IP'}: ${target} from allowlist: ${name}`);
        
        // Build command
        const cmd = ['cscli', 'allowlists', 'remove', name, target];
        
        // Update embed description
        embed.setDescription(`${branding.emojis.loading} Removing ${isRange ? 'range' : 'IP'} ${target} from allowlist "${name}"...`);
        await interaction.editReply({ embeds: [embed] }).catch(error => {
          console.error('Error updating embed:', error);
        });
        
        console.log('Executing command:', cmd.join(' '));
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd).catch(error => {
          console.error('Error executing command:', error);
          throw new Error(`Failed to remove from allowlist: ${error.message}`);
        });
        
        if (!result.success) {
          throw new Error(`Failed to remove from allowlist: ${result.error || "Unknown error"}`);
        }
        
        // Update embed
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} Successfully removed ${isRange ? 'range' : 'IP'} from allowlist.`);
        
        // Create details string
        const details = [
          `Allowlist: ${name}`,
          `Target: ${target}`,
          `Type: ${isRange ? 'Range' : 'IP address'}`
        ];
        
        embed.addFields({ name: 'Removal Details', value: details.join('\n') });
        
        if (result.stdout && result.stdout.trim() !== '') {
          embed.addFields({ name: 'Output', value: '```\n' + result.stdout + '\n```' });
        }
        
      } else if (subcommand === 'delete') {
        console.log('Executing delete subcommand');
        const name = interaction.options.getString('name');
        
        // Update embed description
        embed.setDescription(`${branding.emojis.loading} Deleting allowlist "${name}"...`);
        await interaction.editReply({ embeds: [embed] }).catch(error => {
          console.error('Error updating embed:', error);
        });
        
        // Build command
        const cmd = ['cscli', 'allowlists', 'delete', name];
        console.log('Executing command:', cmd.join(' '));
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd).catch(error => {
          console.error('Error executing command:', error);
          throw new Error(`Failed to delete allowlist: ${error.message}`);
        });
        
        if (!result.success) {
          throw new Error(`Failed to delete allowlist: ${result.error || "Unknown error"}`);
        }
        
        // Update embed
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} Successfully deleted allowlist "${name}".`);
        
        if (result.stdout && result.stdout.trim() !== '') {
          embed.addFields({ name: 'Output', value: '```\n' + result.stdout + '\n```' });
        }
        
      } else {
        throw new Error(`Unknown subcommand: ${subcommand}`);
      }
      
      await interaction.editReply({ embeds: [embed] }).catch(error => {
        console.error('Error sending final response:', error);
      });
      
    } catch (error) {
      console.error('Error executing crowdsecAllowList command:', error);
      
      try {
        // Create error embed with branding
        const errorEmbed = branding.getHeaderEmbed('Error Managing CrowdSec AllowList', 'danger');
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