// commands/vpsLoad.js
const { SlashCommandBuilder } = require("discord.js");
const systemMetrics = require("../backend/systemMetrics");
const branding = require('../backend/pangolinBranding');
const os = require('os');

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
      const cpus = os.cpus();
      const cpuModel = cpus[0].model.trim();
      const coreCount = cpus.length; // This counts all available threads/cores

      // Update description with overall status
      embed.setDescription(`**${branding.emojis.pc} ${cpuModel} - ${coreCount} Core**\n\u200b`);

      // ---------- Helpers ----------
      const getStatusEmoji = (percent, branding) => {
        if (percent >= 90) return branding.emojis.error;
        if (percent >= 70) return branding.emojis.warning;
        return branding.emojis.healthy;
      };

      const progressBar = (percent, size = 9) => {
        const filled = Math.round((percent / 100) * size);
        return `▰`.repeat(filled) + `▱`.repeat(size - filled);
      };

      const loadColor = (load, cores) => {
        if (load > cores) return '🔴';
        if (load > cores * 0.7) return '🟠';
        return '🟢';
      };

      // ---------- CPU ----------
      if (cpu.success) {
        const cpuStatus = getStatusEmoji(cpu.usage, branding);
        embed.addFields({
          name: `${cpuStatus} CPU`,
          value: [
            `**Usage :** ${cpu.usage}%`,
            `${progressBar(cpu.usage)}`,
            ``,
            `**Load Avg**`,
            `${loadColor(cpu.loadAvg1, cpu.cores)} **1Min :** ${cpu.loadAvg1}%`,
            `${loadColor(cpu.loadAvg5, cpu.cores)} **5Min :** ${cpu.loadAvg5}%`,
            `${loadColor(cpu.loadAvg15, cpu.cores)} **15Min :** ${cpu.loadAvg15}%`,
          ].join('\n'),
          inline: true
        });
      } else {
        embed.addFields({
          name: `${branding.emojis.error} CPU`,
          value: `⚠️ Unable to retrieve CPU data`,
          inline: true
        });
      }

      // ---------- MEMORY ----------
      if (memory.success) {
        const memStatus = getStatusEmoji(memory.usagePercent, branding);
        embed.addFields({
          name: `${memStatus} Memory`,
          value: [
            `**Usage :** ${memory.usagePercent}%`,
            `${progressBar(memory.usagePercent)}`,
            ``,
            `**Ram Details**`,
            `**Used :** ${memory.used} MB`,
            `**Free :** ${memory.free} MB`,
            `**Total :** ${memory.total} MB`
          ].join('\n'),
          inline: true
        });
      } else {
        embed.addFields({
          name: `${branding.emojis.error} Memory`,
          value: `⚠️ Unable to retrieve memory data`,
          inline: true
        });
      }

      // ---------- DISK ----------
      if (disk.success) {
        const diskStatus = getStatusEmoji(disk.usagePercent, branding);
        embed.addFields({
          name: `${diskStatus} Disk`,
          value: [
            `**Usage :** ${disk.usagePercent}%`,
            `${progressBar(disk.usagePercent)}`,
            ``,
            `**Disk Details**`,
            `**Used :** ${disk.used}`,
            `**Free :** ${disk.free}`,
            `**Total :** ${disk.total}`
          ].join('\n'),
          inline: true
        });
      } else {
        embed.addFields({
          name: `${branding.emojis.error} Disk`,
          value: `⚠️ Unable to retrieve disk data`,
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