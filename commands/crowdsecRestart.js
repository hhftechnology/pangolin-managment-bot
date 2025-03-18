// commands/crowdsecRestart.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const Docker = require('node-docker-api').Docker;
const dockerManager = require("../backend/dockerManager");
const branding = require('../backend/pangolinBranding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("crowdsecrestart")
    .setDescription("Restart the CrowdSec service")
    .addBooleanOption(option =>
      option.setName('force')
        .setDescription('Force restart without confirmation')
        .setRequired(false)),
            
  async execute(interaction) {
    console.log(`Executing crowdsecrestart command from user ${interaction.user.tag}`);
    
    try {
      const force = interaction.options.getBoolean('force');
      console.log(`Force option: ${force}`);
      
      // Check if CrowdSec container exists
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
      
      // Create embed with branding
      const embed = branding.getHeaderEmbed('CrowdSec Restart', 'warning');
      
      // If force option is used, restart immediately
      if (force) {
        await interaction.deferReply().catch(error => {
          console.error('Error deferring reply:', error);
        });
        
        embed.setDescription(`${branding.emojis.loading} Restarting CrowdSec service...`);
        await interaction.editReply({ embeds: [embed] }).catch(error => {
          console.error('Error updating embed:', error);
        });
        
        // Restart the container
        await restartCrowdSec(interaction, embed).catch(error => {
          console.error('Error restarting CrowdSec:', error);
          throw error;
        });
        return;
      }
      
      // Otherwise, show confirmation dialog
      embed.setDescription(
        `${branding.emojis.warning} **Are you sure you want to restart the CrowdSec service?**\n\n` +
        `This will temporarily interrupt security monitoring and enforcement. ` +
        `Any active connections to CrowdSec API will be interrupted.`
      );
      
      // Create confirmation buttons
      const confirmButton = new ButtonBuilder()
        .setCustomId('confirm_restart')
        .setLabel('Restart CrowdSec')
        .setStyle(ButtonStyle.Danger);
      
      const cancelButton = new ButtonBuilder()
        .setCustomId('cancel_restart')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary);
      
      const row = new ActionRowBuilder()
        .addComponents(confirmButton, cancelButton);
      
      // Send confirmation message
      console.log('Sending confirmation message with buttons');
      const response = await interaction.reply({
        embeds: [embed],
        components: [row]
      }).catch(error => {
        console.error('Error sending confirmation message:', error);
        throw new Error(`Failed to send confirmation message: ${error.message}`);
      });
      
      // Create button collector
      console.log('Creating button collector');
      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60000 // 1 minute timeout
      });
      
      collector.on('collect', async i => {
        console.log(`Button clicked: ${i.customId}`);
        
        // Ensure it's the same user
        if (i.user.id !== interaction.user.id) {
          await i.reply({ content: 'This button is not for you!', ephemeral: true }).catch(error => {
            console.error('Error replying to unauthorized user:', error);
          });
          return;
        }
        
        // Handle button interaction
        if (i.customId === 'confirm_restart') {
          console.log('Restart confirmed, disabling buttons');
          
          // Disable buttons to prevent multiple clicks
          confirmButton.setDisabled(true);
          cancelButton.setDisabled(true);
          
          await i.update({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(confirmButton, cancelButton)]
          }).catch(error => {
            console.error('Error updating buttons:', error);
          });
          
          // Update embed
          embed.setDescription(`${branding.emojis.loading} Restarting CrowdSec service...`);
          
          await i.editReply({
            embeds: [embed],
            components: []
          }).catch(error => {
            console.error('Error updating message:', error);
          });
          
          // Perform the restart
          await restartCrowdSec(i, embed).catch(error => {
            console.error('Error restarting CrowdSec:', error);
          });
        } else if (i.customId === 'cancel_restart') {
          console.log('Restart cancelled');
          
          // Update embed with cancel message
          const cancelEmbed = branding.getHeaderEmbed('Restart Cancelled', 'info');
          cancelEmbed.setDescription(`${branding.emojis.healthy} CrowdSec restart operation cancelled.`);
          
          await i.update({
            embeds: [cancelEmbed],
            components: []
          }).catch(error => {
            console.error('Error updating message with cancellation:', error);
          });
        }
        
        collector.stop();
      });
      
      collector.on('end', async collected => {
        console.log(`Collector ended, collected ${collected.size} interactions`);
        
        if (collected.size === 0) {
          console.log('Timeout - no buttons were clicked');
          
          // Timeout - update message
          const timeoutEmbed = branding.getHeaderEmbed('Restart Cancelled', 'info');
          timeoutEmbed.setDescription(`${branding.emojis.warning} Restart confirmation timed out.`);
          
          await interaction.editReply({
            embeds: [timeoutEmbed],
            components: []
          }).catch(error => {
            console.error('Error updating message with timeout:', error);
          });
        }
      });
    } catch (error) {
      console.error('Error executing crowdsecRestart command:', error);
      
      try {
        // Create error embed with branding
        const errorEmbed = branding.getHeaderEmbed('Error Restarting CrowdSec', 'danger');
        errorEmbed.setDescription(`${branding.emojis.error} An error occurred:\n\`\`\`${error.message}\`\`\``);
        
        // Check if the interaction has been deferred or replied to
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ embeds: [errorEmbed] }).catch(e => {
            console.error('Failed to send error message:', e);
          });
        } else {
          await interaction.reply({ embeds: [errorEmbed] }).catch(e => {
            console.error('Failed to send error message:', e);
          });
        }
      } catch (embedError) {
        console.error('Failed to create error embed:', embedError);
      }
    }
  }
};

/**
 * Function to restart the CrowdSec container
 */
async function restartCrowdSec(interaction, embed) {
  console.log('Beginning CrowdSec restart process');
  
  try {
    // Execute the restart command
    console.log('Attempting to restart CrowdSec via service command');
    const result = await dockerManager.executeInContainer('crowdsec', ['service', 'crowdsec', 'restart']).catch(error => {
      console.warn("Error restarting service:", error.message);
      return { success: false, error: error.message };
    });
    
    // If that fails (e.g., not using systemd), try to restart the container directly
    if (!result || !result.success) {
      console.log("Systemd restart failed, trying Docker restart...");
      try {
        const docker = new Docker({ socketPath: '/var/run/docker.sock' });
        
        // Get the container
        const containers = await docker.container.list({
          all: true,
          filters: { name: ['crowdsec'] }
        });
        
        if (containers.length === 0) {
          throw new Error('CrowdSec container not found');
        }
        
        console.log('Found CrowdSec container, restarting...');
        
        // Restart the container
        await containers[0].restart();
        console.log('Container restart command executed successfully');
      } catch (dockerError) {
        console.error("Docker restart also failed:", dockerError);
        throw dockerError;
      }
    }
    
    // Wait a moment for the service to restart
    console.log('Waiting for service to restart...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check if the service is running again
    console.log('Checking container status after restart');
    const containerStatus = await dockerManager.getContainerDetailedStatus('crowdsec');
    
    if (!containerStatus.running) {
      throw new Error('CrowdSec container failed to restart');
    }
    
    console.log('CrowdSec restarted successfully');
    
    // Update embed with success message
    embed.setColor(branding.colors.success);
    embed.setDescription(`${branding.emojis.healthy} CrowdSec service restarted successfully.`);
    
    // Add details about the service status
    embed.addFields({
      name: 'Service Status',
      value: `Container ID: ${containerStatus.id}\nStatus: ${containerStatus.status}\nUptime: ${containerStatus.uptime || 'Just started'}`
    });
    
    // Suggest checking logs for errors
    embed.addFields({
      name: 'Next Steps',
      value: 'You can check CrowdSec logs for any startup issues with:\n`/pangolinlogs container:crowdsec`'
    });
    
    await interaction.editReply({ embeds: [embed] }).catch(error => {
      console.error('Error sending final success response:', error);
    });
  } catch (error) {
    console.error('Error restarting CrowdSec:', error);
    
    // Create error embed with branding
    const errorEmbed = branding.getHeaderEmbed('Error Restarting CrowdSec', 'danger');
    errorEmbed.setDescription(`${branding.emojis.error} An error occurred while restarting CrowdSec:\n\`\`\`${error.message}\`\`\``);
    
    await interaction.editReply({ embeds: [errorEmbed] }).catch(e => {
      console.error('Failed to send error message:', e);
    });
    
    throw error;
  }
}