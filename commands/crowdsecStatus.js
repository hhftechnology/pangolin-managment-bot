// commands/crowdsecStatus.js
const { SlashCommandBuilder } = require("discord.js");
const Docker = require('node-docker-api').Docker;
const dockerManager = require("../backend/dockerManager");
const branding = require('../backend/pangolinBranding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("crowdsecstatus")
    .setDescription("Shows CrowdSec security status"),
    
  async execute(interaction) {
    console.log(`Executing crowdsecstatus command from user ${interaction.user.tag}`);
    
    try {
      await interaction.deferReply().catch(error => {
        console.error('Error deferring reply:', error);
      });
      
      console.log('Checking CrowdSec container status');
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });
      
      // Check if CrowdSec is running
      const containers = await docker.container.list({ 
        all: true, 
        filters: { name: ['crowdsec'] } 
      }).catch(error => {
        console.error('Error listing containers:', error);
        throw new Error(`Failed to list containers: ${error.message}`);
      });
      
      if (containers.length === 0) {
        console.log('CrowdSec container not found');
        // Use branding for "not found" message
        const notFoundEmbed = branding.getHeaderEmbed('CrowdSec Status', 'warning');
        notFoundEmbed.setDescription(`${branding.emojis.error} CrowdSec container not found.`);
        
        await interaction.editReply({ embeds: [notFoundEmbed] }).catch(error => {
          console.error('Error sending not found response:', error);
        });
        return;
      }
      
      const crowdsec = containers[0];
      
      if (crowdsec.data.State !== 'running') {
        console.log('CrowdSec container not running');
        // Use branding for "not running" message
        const notRunningEmbed = branding.getHeaderEmbed('CrowdSec Status', 'danger');
        notRunningEmbed.setDescription(`${branding.emojis.error} CrowdSec container is not running.`);
        
        await interaction.editReply({ embeds: [notRunningEmbed] }).catch(error => {
          console.error('Error sending not running response:', error);
        });
        return;
      }
      
      console.log('Preparing to execute CrowdSec commands');
      
      // Execute CrowdSec commands using dockerManager for more reliable execution
      const [decisionsResult, bouncersResult, metricsResult] = await Promise.all([
        dockerManager.executeInContainer('crowdsec', ['cscli', 'decisions', 'list', '-o', 'json']),
        dockerManager.executeInContainer('crowdsec', ['cscli', 'bouncers', 'list', '-o', 'json']),
        dockerManager.executeInContainer('crowdsec', ['cscli', 'metrics', '-o', 'json'])
      ]).catch(error => {
        console.error('Error executing CrowdSec commands:', error);
        throw new Error(`Failed to execute CrowdSec commands: ${error.message}`);
      });
      
      console.log('Processing command results');
      
      // Parse results, handling potential parsing errors
      let decisions = [];
      let bouncers = [];
      let metrics = {};
      
      try {
        if (decisionsResult && decisionsResult.success && decisionsResult.stdout) {
          decisions = JSON.parse(decisionsResult.stdout);
          console.log(`Parsed ${decisions.length} decisions`);
        }
      } catch (error) {
        console.error('Error parsing decisions:', error);
        decisions = [];
      }
      
      try {
        if (bouncersResult && bouncersResult.success && bouncersResult.stdout) {
          bouncers = JSON.parse(bouncersResult.stdout);
          console.log(`Parsed ${bouncers.length} bouncers`);
        }
      } catch (error) {
        console.error('Error parsing bouncers:', error);
        bouncers = [];
      }
      
      try {
        if (metricsResult && metricsResult.success && metricsResult.stdout) {
          metrics = JSON.parse(metricsResult.stdout);
          console.log('Parsed metrics successfully');
        }
      } catch (error) {
        console.error('Error parsing metrics:', error);
        metrics = {};
      }
      
      // Create embed with CrowdSec-specific branding
      const embed = branding.getHeaderEmbed(`${branding.emojis.crowdsec} CrowdSec Security Status`, 'crowdsec');
      
      
      // Set description based on security status
      if (decisions.length > 0) {
        embed.setDescription(`${branding.emojis.alert} **${decisions.length} Active Blocks**\nYour Pangolin stack is actively defending against threats.`);
      } else {
        embed.setDescription(`${branding.emojis.secured} **No Active Threats**\nYour Pangolin stack's security perimeter is secure.`);
      }
      
      // Add status fields
      embed.addFields(
        { name: 'Active Decisions', value: `${decisions.length} IP(s) blocked/captcha'd`, inline: true },
        { name: 'Active Bouncers', value: `${bouncers.length} connected`, inline: true }
      );
      
      // Add top blocked IPs if any
      if (decisions.length > 0) {
        // Take up to 5 most recent decisions
        const recentDecisions = decisions.slice(0, 5).map(d => {
          try {
            const reason = d.reason || 'No reason provided';
            const reasonSummary = reason.length > 30 ? reason.substring(0, 30) + '...' : reason;
            return `${branding.emojis.alert} ${d.source || 'Unknown'}: ${d.value || 'Unknown'} (${d.action || 'Unknown'})\n└─ ${reasonSummary}`;
          } catch (error) {
            console.error('Error formatting decision:', error);
            return `${branding.emojis.alert} Error formatting decision`;
          }
        }).join('\n\n');
        
        embed.addFields({ 
          name: 'Recent Security Actions', 
          value: recentDecisions || 'None' 
        });
      }
      
      // Add metrics if available
      if (metrics && metrics.buckets) {
        try {
          embed.addFields({ 
            name: 'Security Metrics', 
            value: `${branding.emojis.alert} Alerts: ${metrics.alerts || 0}\n${branding.emojis.loading} Parsed lines: ${metrics.parsed || 0}` 
          });
        } catch (error) {
          console.error('Error adding metrics field:', error);
        }
      }
      
      console.log('Sending final response');
      await interaction.editReply({ embeds: [embed] }).catch(error => {
        console.error('Error sending final response:', error);
      });
      
    } catch (error) {
      console.error(`Error executing crowdsecStatus command:`, error);
      
      try {
        // Create error embed with branding
        const errorEmbed = branding.getHeaderEmbed('Error Retrieving CrowdSec Status', 'danger');
        errorEmbed.setDescription(`${branding.emojis.error} An error occurred while checking CrowdSec status.\n\`\`\`${error.message}\`\`\``);
        
        // Check if interaction has already been replied to
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