// commands/crowdsecScenarios.js
const { SlashCommandBuilder } = require("discord.js");
const dockerManager = require("../backend/dockerManager");
const branding = require('../backend/pangolinBranding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("crowdsecscenarios")
    .setDescription("Manage CrowdSec scenarios")
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List installed scenarios')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Scenario name to filter (e.g., crowdsecurity/ssh-bf)')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('all')
            .setDescription('Show all scenarios')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('inspect')
        .setDescription('Inspect a specific scenario')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Scenario name to inspect (e.g., crowdsecurity/ssh-bf)')
            .setRequired(true))
        .addBooleanOption(option =>
          option.setName('no_metrics')
            .setDescription("Don't show metrics")
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('diff')
            .setDescription('Show diff with latest version (for tainted items)')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('rev')
            .setDescription('Reverse diff output')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('install')
        .setDescription('Install scenarios')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Scenario name(s) to install (comma-separated, e.g., crowdsecurity/ssh-bf,crowdsecurity/http-probing)')
            .setRequired(true))
        .addBooleanOption(option =>
          option.setName('download_only')
            .setDescription('Only download packages, do not enable')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('force')
            .setDescription('Force install: overwrite tainted and outdated files')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('ignore')
            .setDescription('Ignore errors when installing multiple scenarios')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove scenarios')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Scenario name(s) to remove (comma-separated)')
            .setRequired(true))
        .addBooleanOption(option =>
          option.setName('force')
            .setDescription('Force remove: remove tainted and outdated files')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('purge')
            .setDescription('Delete source file too')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('all')
            .setDescription('Remove all scenarios')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('upgrade')
        .setDescription('Upgrade scenarios')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Scenario name(s) to upgrade (comma-separated)')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('all')
            .setDescription('Upgrade all scenarios')
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
        const embed = branding.getHeaderEmbed('CrowdSec Scenarios', 'crowdsec');
        embed.setDescription(`${branding.emojis.crowdsec} Please select one of these subcommands:`);
        
        // List subcommands in a format similar to Discord's native options display
        const subcommands = [
          { name: 'list', description: 'List installed scenarios' },
          { name: 'inspect', description: 'View details of a specific scenario' },
          { name: 'install', description: 'Install new security scenarios' },
          { name: 'remove', description: 'Remove installed scenarios' },
          { name: 'upgrade', description: 'Upgrade existing scenarios' }
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
      const embed = branding.getHeaderEmbed(`CrowdSec Scenarios - ${subcommand}`, 'crowdsec');
      embed.setDescription(`${branding.emojis.loading} Processing CrowdSec scenarios command...`);
      await interaction.editReply({ embeds: [embed] });
      
      // Handle subcommands
      if (subcommand === 'list') {
        // Build command arguments
        const cmd = ['cscli', 'scenarios', 'list'];
        
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
          throw new Error(`Failed to list scenarios: ${result.error || "Unknown error"}`);
        }
        
        // Create summary embed
        const summaryEmbed = branding.getHeaderEmbed('CrowdSec Scenarios', 'crowdsec');
        summaryEmbed.setDescription(`${branding.emojis.crowdsec} CrowdSec Scenarios`);
        
        // Add explanation of what scenarios are
        summaryEmbed.addFields({
          name: 'What Are Scenarios?',
          value: 'Scenarios are security detection rules that analyze normalized events. They define patterns that might indicate attacks or security threats, and can trigger decisions like bans or captchas when matched.'
        });
        
        // Get the output content
        const scenariosContent = result.stdout || 'No scenarios found.';
        
        // Check if content is empty
        if (scenariosContent.trim() === 'No scenarios found.') {
          summaryEmbed.addFields({ name: 'Results', value: 'No scenarios found.' });
          await interaction.editReply({ embeds: [summaryEmbed] });
        } else {
          // Send the scenarios list as a file attachment
          await interaction.editReply({
            embeds: [summaryEmbed],
            files: [{
              attachment: Buffer.from(scenariosContent),
              name: `crowdsec-scenarios.txt`
            }]
          });
        }
        
      } else if (subcommand === 'inspect') {
        const name = interaction.options.getString('name');
        const noMetrics = interaction.options.getBoolean('no_metrics');
        const diff = interaction.options.getBoolean('diff');
        const rev = interaction.options.getBoolean('rev');
        
        // Build command
        const cmd = ['cscli', 'scenarios', 'inspect', name];
        
        if (noMetrics) cmd.push('--no-metrics');
        if (diff) cmd.push('--diff');
        if (rev) cmd.push('--rev');
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd);
        
        if (!result.success) {
          throw new Error(`Failed to inspect scenario: ${result.error || "Unknown error"}`);
        }
        
        // Create summary embed
        const inspectEmbed = branding.getHeaderEmbed(`CrowdSec Scenario Inspection: ${name}`, 'crowdsec');
        inspectEmbed.setDescription(`${branding.emojis.crowdsec} Scenario: ${name} inspection results`);
        
        // Add options info
        const options = [];
        if (noMetrics) options.push('Metrics hidden');
        if (diff) options.push('Showing diff with latest version');
        if (rev) options.push('Reverse diff');
        
        if (options.length > 0) {
          inspectEmbed.addFields({
            name: 'Options Applied',
            value: options.join(', ')
          });
        }
        
        // Get the output content
        const inspectContent = result.stdout || 'No scenario details found.';
        
        // Send the inspection results as a file attachment
        await interaction.editReply({
          embeds: [inspectEmbed],
          files: [{
            attachment: Buffer.from(inspectContent),
            name: `crowdsec-scenario-${name}.txt`
          }]
        });
        
      } else if (subcommand === 'install') {
        const name = interaction.options.getString('name');
        const downloadOnly = interaction.options.getBoolean('download_only');
        const force = interaction.options.getBoolean('force');
        const ignore = interaction.options.getBoolean('ignore');
        
        // Split comma-separated names
        const names = name.split(',').map(n => n.trim());
        
        // Build command
        const cmd = ['cscli', 'scenarios', 'install', ...names];
        
        if (downloadOnly) cmd.push('--download-only');
        if (force) cmd.push('--force');
        if (ignore) cmd.push('--ignore');
        
        // Update embed description
        embed.setDescription(`${branding.emojis.loading} Installing CrowdSec scenario(s): ${name}...`);
        await interaction.editReply({ embeds: [embed] });
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd);
        
        if (!result.success) {
          throw new Error(`Failed to install scenario(s): ${result.error || "Unknown error"}`);
        }
        
        // Update embed
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} CrowdSec scenario(s) installed successfully.`);
        
        // Get the output content
        const installContent = result.stdout || 'No installation details returned.';
        
        // Send the installation results as a file attachment
        await interaction.editReply({
          embeds: [embed],
          files: [{
            attachment: Buffer.from(installContent),
            name: `crowdsec-scenario-install.txt`
          }]
        });
        
      } else if (subcommand === 'remove') {
        const name = interaction.options.getString('name');
        const force = interaction.options.getBoolean('force');
        const purge = interaction.options.getBoolean('purge');
        const all = interaction.options.getBoolean('all');
        
        // Build command
        const cmd = ['cscli', 'scenarios', 'remove'];
        
        if (all) {
          cmd.push('--all');
        } else {
          // Split comma-separated names
          const names = name.split(',').map(n => n.trim());
          cmd.push(...names);
        }
        
        if (force) cmd.push('--force');
        if (purge) cmd.push('--purge');
        
        // Update embed description
        embed.setDescription(`${branding.emojis.loading} Removing CrowdSec scenario(s)...`);
        await interaction.editReply({ embeds: [embed] });
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd);
        
        if (!result.success) {
          throw new Error(`Failed to remove scenario(s): ${result.error || "Unknown error"}`);
        }
        
        // Update embed
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} CrowdSec scenario(s) removed successfully.`);
        
        // Get the output content
        const removeContent = result.stdout || 'No removal details returned.';
        
        // Send the removal results as a file attachment
        await interaction.editReply({
          embeds: [embed],
          files: [{
            attachment: Buffer.from(removeContent),
            name: `crowdsec-scenario-remove.txt`
          }]
        });
        
      } else if (subcommand === 'upgrade') {
        const name = interaction.options.getString('name');
        const all = interaction.options.getBoolean('all');
        const force = interaction.options.getBoolean('force');
        
        // Build command
        const cmd = ['cscli', 'scenarios', 'upgrade'];
        
        if (all) {
          cmd.push('--all');
        } else if (name) {
          // Split comma-separated names
          const names = name.split(',').map(n => n.trim());
          cmd.push(...names);
        } else {
          throw new Error('Either scenario name or --all option must be provided');
        }
        
        if (force) cmd.push('--force');
        
        // Update embed description
        embed.setDescription(`${branding.emojis.loading} Upgrading CrowdSec scenario(s)...`);
        await interaction.editReply({ embeds: [embed] });
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd);
        
        if (!result.success) {
          throw new Error(`Failed to upgrade scenario(s): ${result.error || "Unknown error"}`);
        }
        
        // Update embed
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} CrowdSec scenario(s) upgraded successfully.`);
        
        // Get the output content
        const upgradeContent = result.stdout || 'No upgrade details returned.';
        
        // Send the upgrade results as a file attachment
        await interaction.editReply({
          embeds: [embed],
          files: [{
            attachment: Buffer.from(upgradeContent),
            name: `crowdsec-scenario-upgrade.txt`
          }]
        });
      }
    } catch (error) {
      console.error('Error executing crowdsecScenarios command:', error);
      
      // Create error embed with branding
      const errorEmbed = branding.getHeaderEmbed('Error Managing CrowdSec Scenarios', 'danger');
      errorEmbed.setDescription(`${branding.emojis.error} An error occurred:\n\`\`\`${error.message}\`\`\``);
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};