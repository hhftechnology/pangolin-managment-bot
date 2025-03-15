// commands/crowdsecStatus.js
const { SlashCommandBuilder } = require("discord.js");
const Docker = require('node-docker-api').Docker;
const { exec } = require('child_process');
const util = require('util');
const branding = require('../backend/pangolinBranding');

// Promisify exec
const execPromise = util.promisify(exec);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("crowdsecstatus")
    .setDescription("Shows CrowdSec security status"),
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });
      
      // Check if CrowdSec is running
      const containers = await docker.container.list({ 
        all: true, 
        filters: { name: ['crowdsec'] } 
      });
      
      if (containers.length === 0) {
        // Use branding for "not found" message
        const notFoundEmbed = branding.getHeaderEmbed('CrowdSec Status', 'warning');
        notFoundEmbed.setDescription(`${branding.emojis.error} CrowdSec container not found.`);
        await interaction.editReply({ embeds: [notFoundEmbed] });
        return;
      }
      
      const crowdsec = containers[0];
      
      if (crowdsec.data.State !== 'running') {
        // Use branding for "not running" message
        const notRunningEmbed = branding.getHeaderEmbed('CrowdSec Status', 'danger');
        notRunningEmbed.setDescription(`${branding.emojis.error} CrowdSec container is not running.`);
        await interaction.editReply({ embeds: [notRunningEmbed] });
        return;
      }
      
      // Execute CrowdSec commands inside the container
      const decisionsCmd = 'docker exec crowdsec cscli decisions list -o json';
      const bouncersCmd = 'docker exec crowdsec cscli bouncers list -o json';
      const metricsCmd = 'docker exec crowdsec cscli metrics -o json';
      
      const [decisionsResult, bouncersResult, metricsResult] = await Promise.all([
        execPromise(decisionsCmd).catch(e => ({ stdout: '[]' })),
        execPromise(bouncersCmd).catch(e => ({ stdout: '[]' })),
        execPromise(metricsCmd).catch(e => ({ stdout: '{}' }))
      ]);
      
      // Parse results
      const decisions = JSON.parse(decisionsResult.stdout);
      const bouncers = JSON.parse(bouncersResult.stdout);
      const metrics = JSON.parse(metricsResult.stdout);
      
      // Create embed with CrowdSec-specific branding
      const embed = branding.getHeaderEmbed(`${branding.emojis.crowdsec} CrowdSec Security Status`, 'crowdsec');
      
      // Set a security shield thumbnail
      embed.setThumbnail('https://assets.crowdsec.net/images/logos/crowdsec/crowdsec-logo.png');
      
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
        const recentDecisions = decisions.slice(0, 5).map(d => 
          `${branding.emojis.alert} ${d.source}: ${d.value} (${d.action})\n└─ ${d.reason.substring(0, 30)}...`
        ).join('\n\n');
        
        embed.addFields({ 
          name: 'Recent Security Actions', 
          value: recentDecisions || 'None' 
        });
      }
      
      // Add metrics if available
      if (metrics && metrics.buckets) {
        embed.addFields({ 
          name: 'Security Metrics', 
          value: `${branding.emojis.alert} Alerts: ${metrics.alerts || 0}\n${branding.emojis.loading} Parsed lines: ${metrics.parsed || 0}` 
        });
      }
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error(`${branding.consoleHeader} Error: ${error.message}`);
      
      // Create error embed with branding
      const errorEmbed = branding.getHeaderEmbed('Error Retrieving CrowdSec Status', 'danger');
      errorEmbed.setDescription(`${branding.emojis.error} An error occurred while checking CrowdSec status.\n\`\`\`${error.message}\`\`\``);
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};