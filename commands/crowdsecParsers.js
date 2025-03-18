// commands/crowdsecParsers.js
const { SlashCommandBuilder } = require("discord.js");
const dockerManager = require("../backend/dockerManager");
const branding = require('../backend/pangolinBranding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("crowdsecparsers")
    .setDescription("Manage CrowdSec parsers")
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List installed parsers')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Parser name to filter')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('all')
            .setDescription('Show all parsers')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('inspect')
        .setDescription('Inspect a specific parser')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Parser name to inspect')
            .setRequired(true))
        .addBooleanOption(option =>
          option.setName('diff')
            .setDescription('Show diff with latest version (for tainted items)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('install')
        .setDescription('Install parsers')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Parser name(s) to install (comma-separated)')
            .setRequired(true))
        .addBooleanOption(option =>
          option.setName('force')
            .setDescription('Force install: overwrite tainted and outdated files')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('download_only')
            .setDescription('Only download packages, do not enable')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove parsers')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Parser name(s) to remove (comma-separated)')
            .setRequired(true))
        .addBooleanOption(option =>
          option.setName('purge')
            .setDescription('Delete source file too')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('force')
            .setDescription('Force remove: remove tainted and outdated files')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('all')
            .setDescription('Remove all parsers')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('upgrade')
        .setDescription('Upgrade parsers')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Parser name(s) to upgrade (comma-separated)')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('all')
            .setDescription('Upgrade all parsers')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('force')
            .setDescription('Force upgrade: overwrite tainted and outdated files')
            .setRequired(false))),
            
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      // Check if a subcommand was provided
      let subcommand;
      try {
        subcommand = interaction.options.getSubcommand();
      } catch (error) {
        // No subcommand specified, show formatted help message
        const embed = branding.getHeaderEmbed('CrowdSec Parsers', 'crowdsec');
        embed.setDescription(`${branding.emojis.crowdsec} Please select one of these subcommands:`);
        
        // List subcommands in a format similar to Discord's native options display
        const subcommands = [
          { name: 'list', description: 'List installed parsers' },
          { name: 'inspect', description: 'View details of a specific parser' },
          { name: 'install', description: 'Install new parsers' },
          { name: 'remove', description: 'Remove installed parsers' },
          { name: 'upgrade', description: 'Upgrade existing parsers' }
        ];
        
        // Format each subcommand in a way that mimics Discord's native option display
        const formattedSubcommands = subcommands.map(cmd => 
          `**/${interaction.commandName} ${cmd.name}** - ${cmd.description}`
        ).join('\n');
        
        embed.addFields({ name: 'Available Subcommands', value: formattedSubcommands });
        
        await interaction.editReply({ embeds: [embed] });
        return;
      }
      
      // Check if CrowdSec container is running
      const containerStatus = await dockerManager.getContainerDetailedStatus('crowdsec');
      
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
      const embed = branding.getHeaderEmbed(`CrowdSec Parsers - ${subcommand}`, 'crowdsec');
      embed.setDescription(`${branding.emojis.loading} Processing CrowdSec parsers command...`);
      await interaction.editReply({ embeds: [embed] });
      
      // Handle subcommands
      if (subcommand === 'list') {
        // Build command arguments
        const cmd = ['cscli', 'parsers', 'list'];
        
        // Add names if provided
        const name = interaction.options.getString('name');
        const all = interaction.options.getBoolean('all');
        
        if (name) {
          // Split comma-separated names
          const names = name.split(',').map(n => n.trim());
          cmd.push(...names);
        } else if (all) {
          cmd.push('-a');
        }
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd);
        
        if (!result.success) {
          throw new Error(`Failed to list parsers: ${result.error || "Unknown error"}`);
        }
        
        // Create summary embed
        const summaryEmbed = branding.getHeaderEmbed('CrowdSec Parsers', 'crowdsec');
        summaryEmbed.setDescription(`${branding.emojis.crowdsec} CrowdSec Parsers`);
        
        // Add explanation of what parsers are
        summaryEmbed.addFields({
          name: 'What Are Parsers?',
          value: 'Parsers transform raw logs into normalized events that CrowdSec can process. They decode, enrich, and structure logs from various sources to be used by security scenarios.'
        });
        
        // Get the output content
        const parsersContent = result.stdout || 'No parsers found.';
        
        // Check if content is empty
        if (parsersContent.trim() === 'No parsers found.') {
          summaryEmbed.addFields({ name: 'Results', value: 'No parsers found.' });
          await interaction.editReply({ embeds: [summaryEmbed] });
        } else {
          // Send the parsers list as a file attachment
          await interaction.editReply({
            embeds: [summaryEmbed],
            files: [{
              attachment: Buffer.from(parsersContent),
              name: `crowdsec-parsers.txt`
            }]
          });
        }
        
      } else if (subcommand === 'inspect') {
        const name = interaction.options.getString('name');
        const diff = interaction.options.getBoolean('diff');
        
        // Build command
        const cmd = ['cscli', 'parsers', 'inspect', name];
        
        if (diff) cmd.push('--diff');
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd);
        
        if (!result.success) {
          throw new Error(`Failed to inspect parser: ${result.error || "Unknown error"}`);
        }
        
        // Create summary embed
        const inspectEmbed = branding.getHeaderEmbed(`CrowdSec Parser Inspection: ${name}`, 'crowdsec');
        inspectEmbed.setDescription(`${branding.emojis.crowdsec} Parser: ${name} inspection results`);
        
        if (diff) {
          inspectEmbed.addFields({
            name: 'Diff Mode',
            value: 'Output shows differences between the installed parser and the latest version'
          });
        }
        
        // Get the output content
        const inspectContent = result.stdout || 'No parser details found.';
        
        // Send the inspection results as a file attachment
        await interaction.editReply({
          embeds: [inspectEmbed],
          files: [{
            attachment: Buffer.from(inspectContent),
            name: `crowdsec-parser-${name}.txt`
          }]
        });
        
      } else if (subcommand === 'install') {
        const name = interaction.options.getString('name');
        const force = interaction.options.getBoolean('force');
        const downloadOnly = interaction.options.getBoolean('download_only');
        
        // Split comma-separated names
        const names = name.split(',').map(n => n.trim());
        
        // Build command
        const cmd = ['cscli', 'parsers', 'install', ...names];
        
        if (force) cmd.push('--force');
        if (downloadOnly) cmd.push('--download-only');
        
        // Update embed description
        embed.setDescription(`${branding.emojis.loading} Installing CrowdSec parser(s): ${name}...`);
        await interaction.editReply({ embeds: [embed] });
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd);
        
        if (!result.success) {
          throw new Error(`Failed to install parser(s): ${result.error || "Unknown error"}`);
        }
        
        // Update embed
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} CrowdSec parser(s) installed successfully.`);
        
        // Get the output content
        const installContent = result.stdout || 'No installation details returned.';
        
        // Send the installation results as a file attachment
        await interaction.editReply({
          embeds: [embed],
          files: [{
            attachment: Buffer.from(installContent),
            name: `crowdsec-parser-install.txt`
          }]
        });
        
      } else if (subcommand === 'remove') {
        const name = interaction.options.getString('name');
        const purge = interaction.options.getBoolean('purge');
        const force = interaction.options.getBoolean('force');
        const all = interaction.options.getBoolean('all');
        
        // Build command
        const cmd = ['cscli', 'parsers', 'remove'];
        
        if (all) {
          cmd.push('--all');
        } else {
          // Split comma-separated names
          const names = name.split(',').map(n => n.trim());
          cmd.push(...names);
        }
        
        if (purge) cmd.push('--purge');
        if (force) cmd.push('--force');
        
        // Update embed description
        embed.setDescription(`${branding.emojis.loading} Removing CrowdSec parser(s)...`);
        await interaction.editReply({ embeds: [embed] });
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd);
        
        if (!result.success) {
          throw new Error(`Failed to remove parser(s): ${result.error || "Unknown error"}`);
        }
        
        // Update embed
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} CrowdSec parser(s) removed successfully.`);
        
        // Get the output content
        const removeContent = result.stdout || 'No removal details returned.';
        
        // Send the removal results as a file attachment
        await interaction.editReply({
          embeds: [embed],
          files: [{
            attachment: Buffer.from(removeContent),
            name: `crowdsec-parser-remove.txt`
          }]
        });
        
      } else if (subcommand === 'upgrade') {
        const name = interaction.options.getString('name');
        const all = interaction.options.getBoolean('all');
        const force = interaction.options.getBoolean('force');
        
        // Build command
        const cmd = ['cscli', 'parsers', 'upgrade'];
        
        if (all) {
          cmd.push('--all');
        } else if (name) {
          // Split comma-separated names
          const names = name.split(',').map(n => n.trim());
          cmd.push(...names);
        } else {
          throw new Error('Either parser name or --all option must be provided');
        }
        
        if (force) cmd.push('--force');
        
        // Update embed description
        embed.setDescription(`${branding.emojis.loading} Upgrading CrowdSec parser(s)...`);
        await interaction.editReply({ embeds: [embed] });
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd);
        
        if (!result.success) {
          throw new Error(`Failed to upgrade parser(s): ${result.error || "Unknown error"}`);
        }
        
        // Update embed
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} CrowdSec parser(s) upgraded successfully.`);
        
        // Get the output content
        const upgradeContent = result.stdout || 'No upgrade details returned.';
        
        // Send the upgrade results as a file attachment
        await interaction.editReply({
          embeds: [embed],
          files: [{
            attachment: Buffer.from(upgradeContent),
            name: `crowdsec-parser-upgrade.txt`
          }]
        });
      }
    } catch (error) {
      console.error('Error executing crowdsecParsers command:', error);
      
      // Create error embed with branding
      const errorEmbed = branding.getHeaderEmbed('Error Managing CrowdSec Parsers', 'danger');
      errorEmbed.setDescription(`${branding.emojis.error} An error occurred:\n\`\`\`${error.message}\`\`\``);
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};