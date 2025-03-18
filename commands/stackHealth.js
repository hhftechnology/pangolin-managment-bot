// commands/stackHealth.js
const { SlashCommandBuilder } = require("discord.js");
const dockerManager = require("../backend/dockerManager");
const branding = require('../backend/pangolinBranding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("stackhealth")
    .setDescription("Check the health of the Pangolin stack"),
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      // Create embed with branding
      const embed = branding.getHeaderEmbed('Pangolin Stack Health Check', 'info');
      
      // Execute command to check stack health
      const healthResult = await dockerManager.checkStackHealth();
      
      if (!healthResult.success) {
        throw new Error(`Failed to check stack health: ${healthResult.error}`);
      }
      
      const results = healthResult.results;
      
      // Count status totals
      let healthyCount = 0;
      let warningCount = 0;
      let criticalCount = 0;
      
      // Count by status
      Object.values(results).forEach(result => {
        if (result.running) {
          healthyCount++;
        } else {
          criticalCount++;
        }
      });
      
      // Set overall status description
      if (criticalCount > 0) {
        embed.setColor(branding.colors.danger);
        embed.setDescription(`${branding.emojis.error} **Some services are not running.**\n${healthyCount} healthy, ${warningCount} warnings, ${criticalCount} critical`);
      } else if (warningCount > 0) {
        embed.setColor(branding.colors.warning);
        embed.setDescription(`${branding.emojis.warning} **Warnings Detected**\n${healthyCount} healthy, ${warningCount} warnings, ${criticalCount} critical`);
      } else {
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} **All Systems Operational**\n${healthyCount} healthy, ${warningCount} warnings, ${criticalCount} critical`);
      }
      
      // Add fields for each container
      embed.addFields(
        { 
          name: `${branding.formatContainerName('pangolin')} pangolin`, 
          value: results.pangolin.running ? 
            `${branding.emojis.healthy} running\nUptime: ${results.pangolin.uptime}\nCPU: ${results.pangolin.cpu}\nMemory: ${results.pangolin.memory}` : 
            `${branding.emojis.error} Not running`,
          inline: true 
        },
        { 
          name: `${branding.formatContainerName('gerbil')} gerbil`, 
          value: results.gerbil.running ? 
            `${branding.emojis.healthy} running\nUptime: ${results.gerbil.uptime}\nCPU: ${results.gerbil.cpu}\nMemory: ${results.gerbil.memory}` : 
            `${branding.emojis.error} Not running`,
          inline: true 
        },
        { 
          name: `${branding.formatContainerName('traefik')} traefik`, 
          value: results.traefik.running ? 
            `${branding.emojis.healthy} running\nUptime: ${results.traefik.uptime}\nCPU: ${results.traefik.cpu}\nMemory: ${results.traefik.memory}` : 
            `${branding.emojis.error} Not running`,
          inline: true 
        },
        { 
          name: `${branding.formatContainerName('crowdsec')} crowdsec`, 
          value: results.crowdsec.running ? 
            `${branding.emojis.healthy} running\nUptime: ${results.crowdsec.uptime}\nCPU: ${results.crowdsec.cpu}\nMemory: ${results.crowdsec.memory}` : 
            `${branding.emojis.error} Not running`,
          inline: true 
        }
      );
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error executing stackHealth command:', error);
      
      // Create error embed with branding
      const errorEmbed = branding.getHeaderEmbed('Error Checking Stack Health', 'danger');
      errorEmbed.setDescription(`${branding.emojis.error} An error occurred while checking stack health.\n\`\`\`${error.message}\`\`\``);
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};