// commands/vpsLoad.js
const { SlashCommandBuilder } = require("discord.js");
const systemMetrics = require("../backend/systemMetrics");
const branding = require('../backend/pangolinBranding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vpsload")
    .setDescription("Check VPS system load (CPU, memory, disk)"),
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      // Create embed with branding
      const embed = branding.getHeaderEmbed('VPS System Load', 'info');
      embed.setDescription(`${branding.emojis.loading} Fetching VPS system metrics...`);
      
      // Send initial response
      await interaction.editReply({ embeds: [embed] });
      
      // Get system load information
      const systemLoad = await systemMetrics.getSystemLoad();
      
      if (!systemLoad.success) {
        throw new Error(`Failed to get system load: ${systemLoad.error}`);
      }
      
      // Update the embed with system metrics
      const { cpu, memory, disk } = systemLoad;
      
      // Set color based on highest load metric
      let highestLoad = 0;
      if (cpu.success) highestLoad = Math.max(highestLoad, cpu.usage);
      if (memory.success) highestLoad = Math.max(highestLoad, memory.usagePercent);
      if (disk.success) highestLoad = Math.max(highestLoad, disk.usagePercent);
      
      if (highestLoad >= 90) {
        embed.setColor(branding.colors.danger);
      } else if (highestLoad >= 70) {
        embed.setColor(branding.colors.warning);
      } else {
        embed.setColor(branding.colors.success);
      }
      
      // Update description with overall status
      embed.setDescription(`${branding.emojis.pangolin} VPS System Load Monitor`);
      
      // Add CPU metrics
      if (cpu.success) {
        let cpuStatus = branding.emojis.healthy;
        if (cpu.usage >= 90) {
          cpuStatus = branding.emojis.error;
        } else if (cpu.usage >= 70) {
          cpuStatus = branding.emojis.warning;
        }
        
        // Format load average with context based on number of cores
        const loadAvg1Color = cpu.loadAvg1 > cpu.cores ? '🔴' : (cpu.loadAvg1 > cpu.cores * 0.7 ? '🟠' : '🟢');
        const loadAvg5Color = cpu.loadAvg5 > cpu.cores ? '🔴' : (cpu.loadAvg5 > cpu.cores * 0.7 ? '🟠' : '🟢');
        const loadAvg15Color = cpu.loadAvg15 > cpu.cores ? '🔴' : (cpu.loadAvg15 > cpu.cores * 0.7 ? '🟠' : '🟢');
        
        embed.addFields({
          name: `${cpuStatus} CPU Usage`,
          value: `Usage: ${cpu.usage}%\nLoad Average: ${loadAvg1Color} ${cpu.loadAvg1} (1m) | ${loadAvg5Color} ${cpu.loadAvg5} (5m) | ${loadAvg15Color} ${cpu.loadAvg15} (15m)\nCPU Cores: ${cpu.cores}`,
          inline: true
        });
      } else {
        embed.addFields({
          name: `${branding.emojis.error} CPU Usage`,
          value: 'Error: Could not fetch CPU metrics',
          inline: true
        });
      }
      
      // Add Memory metrics
      if (memory.success) {
        let memStatus = branding.emojis.healthy;
        if (memory.usagePercent >= 90) {
          memStatus = branding.emojis.error;
        } else if (memory.usagePercent >= 70) {
          memStatus = branding.emojis.warning;
        }
        
        // Create visualization bar
        const barLength = 10;
        const filledBars = Math.round(memory.usagePercent / 100 * barLength);
        const emptyBars = barLength - filledBars;
        const bar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
        
        embed.addFields({
          name: `${memStatus} Memory Usage`,
          value: `Usage: ${memory.usagePercent}%\n${bar}\nUsed: ${memory.used} MB\nTotal: ${memory.total} MB\nFree: ${memory.free} MB`,
          inline: true
        });
      } else {
        embed.addFields({
          name: `${branding.emojis.error} Memory Usage`,
          value: 'Error: Could not fetch memory metrics',
          inline: true
        });
      }
      
      // Add Disk metrics
      if (disk.success) {
        let diskStatus = branding.emojis.healthy;
        if (disk.usagePercent >= 90) {
          diskStatus = branding.emojis.error;
        } else if (disk.usagePercent >= 70) {
          diskStatus = branding.emojis.warning;
        }
        
        // Create visualization bar
        const barLength = 10;
        const filledBars = Math.round(disk.usagePercent / 100 * barLength);
        const emptyBars = barLength - filledBars;
        const bar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
        
        embed.addFields({
          name: `${diskStatus} Disk Usage`,
          value: `Usage: ${disk.usagePercent}%\n${bar}\nUsed: ${disk.used}\nTotal: ${disk.total}\nFree: ${disk.free}`,
          inline: true
        });
      } else {
        embed.addFields({
          name: `${branding.emojis.error} Disk Usage`,
          value: 'Error: Could not fetch disk metrics',
          inline: true
        });
      }
      
      // Add timestamp in footer
      embed.setFooter({
        text: `${branding.getFooter()} • Last updated: ${new Date().toLocaleTimeString()}`
      });
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error executing vpsLoad command:', error);
      
      // Create error embed with branding
      const errorEmbed = branding.getHeaderEmbed('Error Checking VPS Load', 'danger');
      errorEmbed.setDescription(`${branding.emojis.error} An error occurred while checking VPS system load.\n\`\`\`${error.message}\`\`\``);
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};