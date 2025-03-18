// backend/healthmonitor.js
const { Client, GatewayIntentBits } = require('discord.js');
const Docker = require('node-docker-api').Docker;
const fs = require('fs').promises;
const path = require('path');
const branding = require('./pangolinBranding');

// Constants
const CONFIG_PATH = path.join(__dirname, '../data/autoRestart.json');
const ALERT_CHANNEL_ID = process.env.ALERT_CHANNEL_ID || '';

// Initialize Docker and Discord client
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Login to Discord
client.login(process.env.DISCORD_TOKEN);

async function monitorContainers() {
  try {
    // Load auto-restart config
    let config = { containers: {} };
    try {
      const configData = await fs.readFile(CONFIG_PATH, 'utf8');
      config = JSON.parse(configData);
    } catch (error) {
      console.log(`${branding.consoleHeader} No auto-restart config found or invalid format.`);
    }
    
    // Get all containers
    const containers = await docker.container.list({ all: true });
    
    // Check each container configured for auto-restart
    for (const [containerName, settings] of Object.entries(config.containers || {})) {
      if (!settings.enabled) continue;
      
      const container = containers.find(c => 
        c.data.Names.some(name => name.slice(1) === containerName)
      );
      
      if (!container) {
        console.log(`${branding.consoleHeader} Container ${containerName} not found.`);
        continue;
      }
      
      // Check if container is unhealthy or stopped
      const needsRestart = 
        container.data.State !== 'running' || 
        (container.data.Status && container.data.Status.includes('(unhealthy)'));
      
      if (needsRestart) {
        console.log(`${branding.consoleHeader} Container ${containerName} needs restart.`);
        
        // Check attempt limits
        const today = new Date().toISOString().split('T')[0];
        if (settings.lastAttemptDate && settings.lastAttemptDate.startsWith(today)) {
          if (settings.attempts >= settings.maxAttempts) {
            console.log(`${branding.consoleHeader} Maximum restart attempts (${settings.maxAttempts}) reached for ${containerName} today.`);
            await sendAlert(`${branding.emojis.error} Container **${branding.formatContainerName(containerName)}** needs restart but maximum daily attempts (${settings.maxAttempts}) reached.`);
            continue;
          }
        } else {
          // Reset counter for new day
          settings.attempts = 0;
        }
        
        // Attempt restart
        try {
          console.log(`${branding.consoleHeader} Restarting ${containerName}...`);
          await container.restart();
          
          // Update attempt counter
          settings.attempts = (settings.attempts || 0) + 1;
          settings.lastAttemptDate = new Date().toISOString();
          
          await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
          
          // Send alert using branding
          await sendAlert(`${branding.emojis.loading} Auto-restarted **${branding.formatContainerName(containerName)}**\n(Attempt ${settings.attempts}/${settings.maxAttempts} today)`);
        } catch (error) {
          console.error(`${branding.consoleHeader} Error restarting ${containerName}:`, error);
          await sendAlert(`${branding.emojis.error} Failed to auto-restart **${branding.formatContainerName(containerName)}**\n\`\`\`${error.message}\`\`\``);
        }
      }
    }
  } catch (error) {
    console.error(`${branding.consoleHeader} Error in monitoring containers:`, error);
  }
}

async function sendAlert(message) {
  if (!ALERT_CHANNEL_ID) return;
  
  try {
    const channel = await client.channels.fetch(ALERT_CHANNEL_ID);
    if (channel) {
      // Create embed with branding
      const embed = branding.getHeaderEmbed('Pangolin Auto-Healing Alert');
      embed.setDescription(message);
      
      await channel.send({ embeds: [embed] });
    }
  } catch (error) {
    console.error(`${branding.consoleHeader} Error sending alert:`, error);
  }
}

// Wait for Discord client to be ready
client.once('ready', () => {
  console.log(`${branding.consoleHeader} Health monitor ready!`);
  
  // Run initial check
  monitorContainers();
  
  // Set interval for periodic checks (every 5 minutes)
  setInterval(monitorContainers, 5 * 60 * 1000);
});