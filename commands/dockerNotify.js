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
    .setDescription("Configure Discord notifications for Docker container updates")
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup')
        .setDescription('Set up Discord notifications for container updates')
        .addStringOption(option =>
          option.setName('webhook_url')
            .setDescription('Discord webhook URL')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('server_name')
            .setDescription('Name of your server (shown in notifications)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check notification configuration status'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('test')
        .setDescription('Send a test notification'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('disable')
        .setDescription('Disable notifications')),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const subcommand = interaction.options.getSubcommand();
      
      // Create embed with branding
      const embed = branding.getHeaderEmbed('Docker Notifications', 'info');
      
      // Path to store notification configuration
      const dataDir = path.join(process.cwd(), 'data');
      const configFile = path.join(dataDir, 'notification_config.json');
      
      // Ensure data directory exists
      try {
        await fs.mkdir(dataDir, { recursive: true });
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw error;
        }
      }
      
      // Function to read configuration
      async function getConfig() {
        try {
          const data = await fs.readFile(configFile, 'utf8');
          return JSON.parse(data);
        } catch (error) {
          if (error.code === 'ENOENT') {
            return null;
          }
          throw error;
        }
      }
      
      // Function to save configuration
      async function saveConfig(config) {
        await fs.writeFile(configFile, JSON.stringify(config, null, 2));
      }
      
      if (subcommand === 'setup') {
        const webhookUrl = interaction.options.getString('webhook_url');
        const serverName = interaction.options.getString('server_name') || 'Docker Server';
        
        embed.setDescription(`${branding.emojis.loading} Setting up Discord notifications...`);
        await interaction.editReply({ embeds: [embed] });
        
        // Validate webhook URL
        if (!webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
          embed.setColor(branding.colors.danger);
          embed.setDescription(`${branding.emojis.error} Invalid Discord webhook URL.`);
          await interaction.editReply({ embeds: [embed] });
          return;
        }
        
        // Create configuration
        const config = {
          type: 'discord',
          webhookUrl,
          serverName,
          enabled: true,
          setupDate: new Date().toISOString()
        };
        
        // Save configuration
        await saveConfig(config);
        
        embed.setColor(branding.colors.success);
        embed.setDescription(
          `${branding.emojis.healthy} Successfully set up Discord notifications!\n\n` +
          `Server Name: **${serverName}**\n` +
          `Webhook: \`${webhookUrl.substring(0, 40)}...\``
        );
        
        embed.addFields({
          name: 'How It Works',
          value: 'When you run `/dockercheck`, if updates are found, a notification will be sent to the configured Discord webhook.'
        });
        
        await interaction.editReply({ embeds: [embed] });
      } else if (subcommand === 'status') {
        embed.setDescription(`${branding.emojis.loading} Checking notification configuration...`);
        await interaction.editReply({ embeds: [embed] });
        
        const config = await getConfig();
        
        if (!config || !config.enabled) {
          embed.setColor(branding.colors.warning);
          embed.setDescription(
            `${branding.emojis.warning} Notifications are not configured or disabled.\n\n` +
            `Use \`/dockernotify setup\` to set up notifications.`
          );
        } else {
          embed.setColor(branding.colors.success);
          embed.setDescription(
            `${branding.emojis.healthy} Notifications are configured and enabled!`
          );
          
          embed.addFields(
            { name: 'Type', value: config.type.charAt(0).toUpperCase() + config.type.slice(1) },
            { name: 'Server Name', value: config.serverName },
            { name: 'Setup Date', value: new Date(config.setupDate).toLocaleString() }
          );
          
          if (config.type === 'discord') {
            embed.addFields({
              name: 'Discord Webhook',
              value: `\`${config.webhookUrl.substring(0, 40)}...\``
            });
          }
        }
        
        await interaction.editReply({ embeds: [embed] });
      } else if (subcommand === 'test') {
        embed.setDescription(`${branding.emojis.loading} Sending test notification...`);
        await interaction.editReply({ embeds: [embed] });
        
        const config = await getConfig();
        
        if (!config || !config.enabled) {
          embed.setColor(branding.colors.danger);
          embed.setDescription(
            `${branding.emojis.error} Notifications are not configured or disabled.\n\n` +
            `Use \`/dockernotify setup\` to set up notifications.`
          );
          await interaction.editReply({ embeds: [embed] });
          return;
        }
        
        // Send test notification
        try {
          if (config.type === 'discord') {
            const testContainers = ['test-container-1', 'test-container-2', 'test-container-3'];
            
            // Create Discord webhook payload
            const payload = {
              username: `${config.serverName} Updates`,
              content: '🐋 **Docker Container Updates Available**',
              embeds: [{
                title: 'Test Notification',
                description: 'This is a test notification from your Docker update bot.',
                color: 0xFFA500, // Orange
                fields: [{
                  name: 'Containers with Updates',
                  value: testContainers.map(c => `• ${c}`).join('\n')
                }],
                footer: {
                  text: `From: ${config.serverName} • ${new Date().toLocaleString()}`
                }
              }]
            };
            
            // Send the webhook
            const curlCommand = `curl -H "Content-Type: application/json" -d '${JSON.stringify(payload)}' ${config.webhookUrl}`;
            await execPromise(curlCommand);
            
            embed.setColor(branding.colors.success);
            embed.setDescription(
              `${branding.emojis.healthy} Test notification sent successfully!\n\n` +
              `Check your Discord channel to see if it was received.`
            );
          } else {
            embed.setColor(branding.colors.warning);
            embed.setDescription(
              `${branding.emojis.warning} Unsupported notification type: ${config.type}\n\n` +
              `Only Discord notifications are fully supported in this version.`
            );
          }
        } catch (error) {
          embed.setColor(branding.colors.danger);
          embed.setDescription(
            `${branding.emojis.error} Error sending test notification:\n\`\`\`${error.message}\`\`\``
          );
        }
        
        await interaction.editReply({ embeds: [embed] });
      } else if (subcommand === 'disable') {
        embed.setDescription(`${branding.emojis.loading} Disabling notifications...`);
        await interaction.editReply({ embeds: [embed] });
        
        const config = await getConfig();
        
        if (!config || !config.enabled) {
          embed.setColor(branding.colors.warning);
          embed.setDescription(
            `${branding.emojis.warning} Notifications are already disabled or not configured.`
          );
        } else {
          // Disable notifications
          config.enabled = false;
          await saveConfig(config);
          
          embed.setColor(branding.colors.success);
          embed.setDescription(
            `${branding.emojis.healthy} Notifications have been disabled.\n\n` +
            `You can re-enable them by running \`/dockernotify setup\` again.`
          );
        }
        
        await interaction.editReply({ embeds: [embed] });
      }
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

// Function to send actual notifications - can be called from dockercheck command
async function sendUpdateNotification(containers) {
  try {
    // Path to config file
    const configFile = path.join(process.cwd(), 'data', 'notification_config.json');
    
    // Read config
    const configData = await fs.readFile(configFile, 'utf8');
    const config = JSON.parse(configData);
    
    if (!config || !config.enabled) {
      console.log("Notifications are disabled or not configured.");
      return false;
    }
    
    if (config.type === 'discord') {
      // Create Discord webhook payload
      const payload = {
        username: `${config.serverName} Updates`,
        content: '🐋 **Docker Container Updates Available**',
        embeds: [{
          title: 'Container Updates',
          description: 'The following containers have updates available:',
          color: 0xFFA500, // Orange
          fields: [{
            name: 'Containers',
            value: containers.map(c => `• ${c}`).join('\n')
          }],
          footer: {
            text: `From: ${config.serverName} • ${new Date().toLocaleString()}`
          }
        }]
      };
      
      // Send the webhook
      const curlCommand = `curl -H "Content-Type: application/json" -d '${JSON.stringify(payload)}' ${config.webhookUrl}`;
      await execPromise(curlCommand);
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error("Error sending notification:", error);
    return false;
  }
}

module.exports.sendUpdateNotification = sendUpdateNotification; 