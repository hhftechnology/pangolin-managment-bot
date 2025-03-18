// commands/dockernotify.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs').promises;
const path = require('path');
const branding = require('../backend/pangolinBranding');

// Promisify exec
const execPromise = util.promisify(exec);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dockernotify")
    .setDescription("Configure Docker update notifications")
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup')
        .setDescription('Set up notifications for Docker container updates')
        .addStringOption(option =>
          option.setName('type')
            .setDescription('Notification type')
            .setRequired(true)
            .addChoices(
              { name: 'Discord', value: 'discord' },
              { name: 'Email (SMTP)', value: 'smtp' },
              { name: 'Telegram', value: 'telegram' },
              { name: 'Matrix', value: 'matrix' },
              { name: 'Pushbullet', value: 'pushbullet' },
              { name: 'Pushover', value: 'pushover' },
              { name: 'Gotify', value: 'gotify' },
              { name: 'Ntfy.sh', value: 'ntfy-sh' },
              { name: 'Apprise', value: 'apprise' },
              { name: 'Synology DSM', value: 'dsm' },
            )))
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check if notifications are configured'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('test')
        .setDescription('Send a test notification')),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const subcommand = interaction.options.getSubcommand();
      
      // Create embed with branding
      const embed = branding.getHeaderEmbed('Docker Notifications', 'info');
      
      // Get the script directory
      const scriptDir = process.cwd();
      
      if (subcommand === 'setup') {
        const notifyType = interaction.options.getString('type');
        
        embed.setDescription(`${branding.emojis.loading} Setting up ${notifyType} notifications...`);
        await interaction.editReply({ embeds: [embed] });
        
        // Template file path
        const templateFile = path.join(scriptDir, 'notify_templates', `notify_${notifyType}.sh`);
        const targetFile = path.join(scriptDir, 'notify.sh');
        
        // Check if template exists
        try {
          await fs.access(templateFile);
        } catch (error) {
          embed.setColor(branding.colors.danger);
          embed.setDescription(`${branding.emojis.error} Notification template for ${notifyType} not found.`);
          await interaction.editReply({ embeds: [embed] });
          return;
        }
        
        // Copy the template
        try {
          await fs.copyFile(templateFile, targetFile);
          
          embed.setColor(branding.colors.success);
          embed.setDescription(
            `${branding.emojis.healthy} Successfully set up ${notifyType} notifications!\n\n` +
            `You will need to customize the notify.sh file with your specific details.\n` +
            `The file is located at: \`${targetFile}\``
          );
          
          // Get the first few lines of the file to show what needs to be configured
          const fileContent = await fs.readFile(templateFile, 'utf8');
          const configLines = fileContent.split('\n')
            .filter(line => line.includes('=') && !line.trim().startsWith('#'))
            .slice(0, 5)
            .map(line => line.trim());
          
          if (configLines.length > 0) {
            embed.addFields({
              name: 'Configuration Needed',
              value: '```bash\n' + configLines.join('\n') + '\n```\nEdit these values in notify.sh'
            });
          }
        } catch (error) {
          embed.setColor(branding.colors.danger);
          embed.setDescription(
            `${branding.emojis.error} Error setting up notifications: ${error.message}\n` +
            `Please manually copy ${templateFile} to ${targetFile}`
          );
        }
      } else if (subcommand === 'status') {
        embed.setDescription(`${branding.emojis.loading} Checking notification configuration...`);
        await interaction.editReply({ embeds: [embed] });
        
        const notifyFile = path.join(scriptDir, 'notify.sh');
        
        try {
          // Check if the file exists
          await fs.access(notifyFile);
          
          // Try to determine what type of notification is configured
          const fileContent = await fs.readFile(notifyFile, 'utf8');
          
          // Look for known signatures in the file
          let notifyType = 'unknown';
          if (fileContent.includes('NOTIFY_DISCORD_VERSION')) notifyType = 'Discord';
          else if (fileContent.includes('NOTIFY_SMTP_VERSION')) notifyType = 'Email (SMTP)';
          else if (fileContent.includes('NOTIFY_TELEGRAM_VERSION')) notifyType = 'Telegram';
          else if (fileContent.includes('NOTIFY_MATRIX_VERSION')) notifyType = 'Matrix';
          else if (fileContent.includes('NOTIFY_PUSHBULLET_VERSION')) notifyType = 'Pushbullet';
          else if (fileContent.includes('NOTIFY_PUSHOVER_VERSION')) notifyType = 'Pushover';
          else if (fileContent.includes('NOTIFY_GOTIFY_VERSION')) notifyType = 'Gotify';
          else if (fileContent.includes('NOTIFY_NTFYSH_VERSION')) notifyType = 'Ntfy.sh';
          else if (fileContent.includes('NOTIFY_APPRISE_VERSION')) notifyType = 'Apprise';
          else if (fileContent.includes('NOTIFY_DSM_VERSION')) notifyType = 'Synology DSM';
          
          embed.setColor(branding.colors.success);
          embed.setDescription(
            `${branding.emojis.healthy} Notifications are configured!\n\n` +
            `Type: **${notifyType}**\n` +
            `File: \`${notifyFile}\``
          );
          
          // Check if there's a dockcheck_notification function (for script updates)
          if (fileContent.includes('dockcheck_notification()')) {
            embed.addFields({
              name: 'Script Update Notifications',
              value: 'Configured to notify when dockcheck script updates are available.'
            });
          } else {
            embed.addFields({
              name: 'Script Update Notifications',
              value: 'Not configured to notify when dockcheck script updates are available.'
            });
          }
        } catch (error) {
          embed.setColor(branding.colors.warning);
          embed.setDescription(
            `${branding.emojis.warning} Notifications are not configured.\n\n` +
            `Use \`/dockernotify setup\` to set up notifications.`
          );
        }
      } else if (subcommand === 'test') {
        embed.setDescription(`${branding.emojis.loading} Sending test notification...`);
        await interaction.editReply({ embeds: [embed] });
        
        const notifyFile = path.join(scriptDir, 'notify.sh');
        
        try {
          // Check if the file exists
          await fs.access(notifyFile);
          
          // Create a simple script to call notify.sh with a test message
          const testScriptContent = `#!/bin/bash
source "${notifyFile}"
Updates=("Test Container 1" "Test Container 2")
send_notification "\${Updates[@]}"
`;
          const testScriptPath = path.join(scriptDir, 'test_notification.sh');
          await fs.writeFile(testScriptPath, testScriptContent);
          await fs.chmod(testScriptPath, 0o755);
          
          // Execute the test script
          const { stdout, stderr } = await execPromise(testScriptPath);
          
          // Clean up the test script
          await fs.unlink(testScriptPath);
          
          if (stderr && stderr.includes('Error')) {
            embed.setColor(branding.colors.danger);
            embed.setDescription(
              `${branding.emojis.error} Error sending test notification:\n\`\`\`${stderr}\`\`\``
            );
          } else {
            embed.setColor(branding.colors.success);
            embed.setDescription(
              `${branding.emojis.healthy} Test notification sent successfully!\n\n` +
              `Check your configured notification channel to see if it was received.`
            );
            
            if (stdout) {
              embed.addFields({
                name: 'Output',
                value: '```\n' + stdout.substring(0, 1000) + '\n```'
              });
            }
          }
        } catch (error) {
          embed.setColor(branding.colors.danger);
          embed.setDescription(
            `${branding.emojis.error} Error testing notifications: ${error.message}\n\n` +
            `Make sure notifications are set up with \`/dockernotify setup\`.`
          );
        }
      }
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Error executing dockernotify:", error);
      
      // Create error embed with branding
      const errorEmbed = branding.getHeaderEmbed('Error Configuring Notifications', 'danger');
      errorEmbed.setDescription(
        `${branding.emojis.error} An error occurred while configuring Docker notifications.\n\n` +
        `\`\`\`${error.message}\`\`\``
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};