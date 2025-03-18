// commands/crowdsecWhitelist.js
const { SlashCommandBuilder } = require("discord.js");
const dockerManager = require("../backend/dockerManager");
const branding = require('../backend/pangolinBranding');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("crowdsecwhitelist")
    .setDescription("Manage CrowdSec IP whitelists")
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add an IP or range to whitelist')
        .addStringOption(option =>
          option.setName('target')
            .setDescription('IP address or CIDR range to whitelist')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('reason')
            .setDescription('Reason for whitelisting')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List whitelisted IPs and ranges'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove an IP or range from whitelist')
        .addStringOption(option =>
          option.setName('target')
            .setDescription('IP address or CIDR range to remove from whitelist')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Show whitelist configuration status')),
            
  async execute(interaction) {
    console.log(`Executing crowdsecwhitelist command from user ${interaction.user.tag}`);
    
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
        const embed = branding.getHeaderEmbed('CrowdSec Whitelist', 'crowdsec');
        embed.setDescription(`${branding.emojis.crowdsec} Please select one of these subcommands:`);
        
        const subcommands = [
          { name: 'add', description: 'Add an IP or range to whitelist' },
          { name: 'list', description: 'List whitelisted IPs and ranges' },
          { name: 'remove', description: 'Remove an IP or range from whitelist' },
          { name: 'status', description: 'Show whitelist configuration status' }
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
      const embed = branding.getHeaderEmbed(`CrowdSec Whitelist - ${subcommand}`, 'crowdsec');
      embed.setDescription(`${branding.emojis.loading} Processing CrowdSec whitelist command...`);
      await interaction.editReply({ embeds: [embed] }).catch(error => {
        console.error('Error updating embed:', error);
      });
      
      // For adding an IP directly to decisions list (temporary whitelist)
      if (subcommand === 'add') {
        console.log('Executing add subcommand');
        const target = interaction.options.getString('target');
        const reason = interaction.options.getString('reason') || 'trusted source';
        
        // Determine if this is an IP or a range
        const isRange = target.includes('/');
        console.log(`Adding ${isRange ? 'range' : 'IP'}: ${target}`);
        
        // Build command to add to decisions
        let cmd;
        if (isRange) {
          cmd = ['cscli', 'decisions', 'add', '--range', target, '--type', 'whitelist', '--duration', '8760h', '--reason', reason];
        } else {
          cmd = ['cscli', 'decisions', 'add', '--ip', target, '--type', 'whitelist', '--duration', '8760h', '--reason', reason];
        }
        
        // Update embed description
        embed.setDescription(`${branding.emojis.loading} Adding ${isRange ? 'range' : 'IP'} ${target} to whitelist...`);
        await interaction.editReply({ embeds: [embed] }).catch(error => {
          console.error('Error updating embed:', error);
        });
        
        console.log('Executing command:', cmd.join(' '));
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd).catch(error => {
          console.error('Error executing command:', error);
          throw new Error(`Failed to add to whitelist: ${error.message}`);
        });
        
        if (!result.success) {
          throw new Error(`Failed to add to whitelist: ${result.error || "Unknown error"}`);
        }
        
        // Update embed
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} Successfully added ${isRange ? 'range' : 'IP'} to whitelist.`);
        
        // Create details string
        const details = [
          `Target: ${target}`,
          `Type: ${isRange ? 'Range' : 'IP address'}`,
          `Duration: 1 year (8760h)`,
          `Reason: ${reason}`
        ];
        
        embed.addFields({ name: 'Whitelist Details', value: details.join('\n') });
        
        if (result.stdout && result.stdout.trim() !== '') {
          embed.addFields({ name: 'Output', value: '```\n' + result.stdout + '\n```' });
        }
        
        // Add note about permanent whitelisting
        embed.addFields({ 
          name: 'Note', 
          value: 'This adds a temporary whitelist decision valid for 1 year. For permanent whitelisting, consider modifying the whitelist configuration file.' 
        });
        
      } else if (subcommand === 'list') {
        console.log('Executing list subcommand');
        
        // Get all whitelist decisions
        const cmd = ['cscli', 'decisions', 'list', '--type', 'whitelist'];
        console.log('Executing command:', cmd.join(' '));
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd).catch(error => {
          console.error('Error executing command:', error);
          throw new Error(`Failed to list whitelist: ${error.message}`);
        });
        
        if (!result.success) {
          throw new Error(`Failed to list whitelist: ${result.error || "Unknown error"}`);
        }
        
        // Format the output
        let formattedOutput = 'No whitelist entries found.';
        if (result.stdout && result.stdout.trim() !== '') {
          formattedOutput = '```\n' + result.stdout + '\n```';
          
          // If output is too long, truncate it
          if (formattedOutput.length > 4000) {
            formattedOutput = '```\n' + result.stdout.substring(0, 3900) + '\n...\n(Output truncated due to size limits)\n```';
          }
        }
        
        // Check for whitelist configuration in parsers
        console.log('Checking for whitelist configuration files');
        const whitelistCheckCmd = ['find', '/etc/crowdsec/parsers', '-name', '*.yaml', '-exec', 'grep', '-l', 'whitelist', '{}', ';'];
        const whitelistResult = await dockerManager.executeInContainer('crowdsec', whitelistCheckCmd).catch(error => {
          console.error('Error checking whitelist files:', error);
          return { success: false, error: error.message };
        });
        
        // Update embed
        embed.setDescription(`${branding.emojis.crowdsec} CrowdSec Whitelist Entries`);
        embed.addFields({ name: 'Active Whitelist Decisions', value: formattedOutput });
        
        // Add information about permanent whitelist files
        if (whitelistResult && whitelistResult.success && whitelistResult.stdout) {
          const whitelistFiles = whitelistResult.stdout.split('\n').filter(line => line.trim() !== '');
          
          if (whitelistFiles.length > 0) {
            embed.addFields({ 
              name: 'Permanent Whitelist Configuration Files', 
              value: '```\n' + whitelistFiles.join('\n') + '\n```'
            });
          }
        }
        
      } else if (subcommand === 'remove') {
        console.log('Executing remove subcommand');
        const target = interaction.options.getString('target');
        
        // Determine if this is an IP or a range
        const isRange = target.includes('/');
        console.log(`Removing ${isRange ? 'range' : 'IP'}: ${target}`);
        
        // Build command
        let cmd;
        if (isRange) {
          cmd = ['cscli', 'decisions', 'delete', '--range', target, '--type', 'whitelist'];
        } else {
          cmd = ['cscli', 'decisions', 'delete', '--ip', target, '--type', 'whitelist'];
        }
        
        // Update embed description
        embed.setDescription(`${branding.emojis.loading} Removing ${isRange ? 'range' : 'IP'} ${target} from whitelist...`);
        await interaction.editReply({ embeds: [embed] }).catch(error => {
          console.error('Error updating embed:', error);
        });
        
        console.log('Executing command:', cmd.join(' '));
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd).catch(error => {
          console.error('Error executing command:', error);
          throw new Error(`Failed to remove from whitelist: ${error.message}`);
        });
        
        if (!result.success) {
          throw new Error(`Failed to remove from whitelist: ${result.error || "Unknown error"}`);
        }
        
        // Update embed
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} Successfully removed ${isRange ? 'range' : 'IP'} from whitelist.`);
        
        // Create details string
        const details = [
          `Target: ${target}`,
          `Type: ${isRange ? 'Range' : 'IP address'}`
        ];
        
        embed.addFields({ name: 'Removal Details', value: details.join('\n') });
        
        if (result.stdout && result.stdout.trim() !== '') {
          embed.addFields({ name: 'Output', value: '```\n' + result.stdout + '\n```' });
        }
        
      } else if (subcommand === 'status') {
        console.log('Executing status subcommand');
        
        // Check for whitelist configuration in parsers
        console.log('Checking for whitelist configuration files');
        const whitelistCheckCmd = ['find', '/etc/crowdsec/parsers', '-name', '*.yaml', '-exec', 'grep', '-l', 'whitelist', '{}', ';'];
        const whitelistResult = await dockerManager.executeInContainer('crowdsec', whitelistCheckCmd).catch(error => {
          console.error('Error checking whitelist files:', error);
          return { success: false, error: error.message };
        });
        
        // Get content of whitelists.yaml if it exists
        console.log('Checking for whitelists.yaml content');
        const whitelistContentCmd = ['cat', '/etc/crowdsec/parsers/s02-enrich/whitelists.yaml'];
        const contentResult = await dockerManager.executeInContainer('crowdsec', whitelistContentCmd).catch(error => {
          console.error('Error getting whitelist content:', error);
          return { success: false, error: error.message };
        });
        
        // Get all whitelist decisions
        console.log('Getting active whitelist decisions');
        const decisionsCmd = ['cscli', 'decisions', 'list', '--type', 'whitelist'];
        const decisionsResult = await dockerManager.executeInContainer('crowdsec', decisionsCmd).catch(error => {
          console.error('Error getting whitelist decisions:', error);
          return { success: false, error: error.message };
        });
        
        // Update embed
        embed.setDescription(`${branding.emojis.crowdsec} CrowdSec Whitelist Status`);
        
        // Add information about whitelist files
        if (whitelistResult && whitelistResult.success && whitelistResult.stdout) {
          const whitelistFiles = whitelistResult.stdout.split('\n').filter(line => line.trim() !== '');
          
          if (whitelistFiles.length > 0) {
            embed.addFields({ 
              name: 'Whitelist Configuration Files', 
              value: '```\n' + whitelistFiles.join('\n') + '\n```'
            });
          } else {
            embed.addFields({ 
              name: 'Whitelist Configuration Files', 
              value: 'No permanent whitelist configuration files found.'
            });
          }
        }
        
        // Add content of main whitelist file if it exists
        if (contentResult && contentResult.success && contentResult.stdout) {
          const content = contentResult.stdout;
          
          try {
            // Try to extract IPs, CIDRs and expressions
            const ipMatches = content.match(/ip:[\s\S]*?(?=\n\w|$)/);
            const cidrMatches = content.match(/cidr:[\s\S]*?(?=\n\w|$)/);
            const exprMatches = content.match(/expression:[\s\S]*?(?=\n\w|$)/);
            
            let ipList = 'None';
            let cidrList = 'None';
            let exprList = 'None';
            
            if (ipMatches && ipMatches[0]) {
              ipList = ipMatches[0].replace(/ip:/, '').trim();
            }
            
            if (cidrMatches && cidrMatches[0]) {
              cidrList = cidrMatches[0].replace(/cidr:/, '').trim();
            }
            
            if (exprMatches && exprMatches[0]) {
              exprList = exprMatches[0].replace(/expression:/, '').trim();
            }
            
            embed.addFields({
              name: 'Permanent Whitelist Configuration',
              value: [
                '**Whitelisted IPs:**',
                '```' + ipList + '```',
                '**Whitelisted CIDR Ranges:**',
                '```' + cidrList + '```',
                '**Whitelist Expressions:**',
                '```' + exprList + '```'
              ].join('\n')
            });
          } catch (parseError) {
            console.error('Error parsing whitelist content:', parseError);
            embed.addFields({
              name: 'Permanent Whitelist Configuration',
              value: 'Error parsing configuration file. Raw content:\n```\n' + 
                     (content.length > 1000 ? content.substring(0, 1000) + '...' : content) + '\n```'
            });
          }
        }
        
        // Add information about active whitelist decisions
        if (decisionsResult && decisionsResult.success) {
          let decisionsOutput = 'No active whitelist decisions found.';
          if (decisionsResult.stdout && decisionsResult.stdout.trim() !== '') {
            decisionsOutput = '```\n' + decisionsResult.stdout + '\n```';
            
            // If output is too long, truncate it
            if (decisionsOutput.length > 2000) {
              decisionsOutput = '```\n' + decisionsResult.stdout.substring(0, 1900) + '\n...\n(Output truncated due to size limits)\n```';
            }
          }
          
          embed.addFields({ name: 'Active Whitelist Decisions', value: decisionsOutput });
        }
        
        // Add a guide for permanent whitelisting
        embed.addFields({
          name: 'How to Configure Permanent Whitelist',
          value: 'To set up a permanent whitelist, create or edit `/etc/crowdsec/parsers/s02-enrich/whitelists.yaml` ' +
                'with your whitelist configuration and restart CrowdSec. Example format:\n' +
                '```yaml\n' +
                'name: crowdsecurity/whitelists\n' +
                'description: "Whitelist configuration for trusted IPs and users"\n' +
                'whitelist:\n' +
                '  reason: "trusted sources"\n' +
                '  ip:\n' +
                '    - "192.168.1.1"\n' +
                '  cidr:\n' +
                '    - "10.0.0.0/8"\n' +
                '    - "192.168.1.0/24"\n' +
                '  expression:\n' +
                '    - evt.Parsed.source_ip == \'127.0.0.1\'\n' +
                '```\n' +
                'After editing, restart CrowdSec with `docker restart crowdsec`'
        });
      } else {
        throw new Error(`Unknown subcommand: ${subcommand}`);
      }
      
      await interaction.editReply({ embeds: [embed] }).catch(error => {
        console.error('Error sending final response:', error);
      });
      
    } catch (error) {
      console.error('Error executing crowdsecWhitelist command:', error);
      
      try {
        // Create error embed with branding
        const errorEmbed = branding.getHeaderEmbed('Error Managing CrowdSec Whitelist', 'danger');
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