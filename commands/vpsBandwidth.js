// commands/vpsBandwidth.js
const { SlashCommandBuilder } = require("discord.js");
const systemMetrics = require("../backend/systemMetrics");
const branding = require('../backend/pangolinBranding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vpsbandwidth")
    .setDescription("Check VPS network bandwidth usage"),
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      // Create embed with branding
      const embed = branding.getHeaderEmbed('VPS Bandwidth Monitor', 'info');
      embed.setDescription(`${branding.emojis.loading} Fetching network bandwidth metrics...`);
      
      // Send initial response
      await interaction.editReply({ embeds: [embed] });
      
      // Get bandwidth information
      const bandwidthInfo = await systemMetrics.getBandwidthInfo();
      
      if (!bandwidthInfo.success) {
        throw new Error(`Failed to get bandwidth info: ${bandwidthInfo.error}`);
      }
      
      // Update the embed
      embed.setColor(branding.colors.primary);
      embed.setDescription(`${branding.emojis.pangolin} VPS Network Bandwidth Monitor`);
      
      // Add total bandwidth metrics
      embed.addFields({
        name: '📊 Total Network Traffic',
        value: `Download Total: ${bandwidthInfo.total.rxTotal}\nUpload Total: ${bandwidthInfo.total.txTotal}`,
        inline: false
      });
      
      // Add interface-specific bandwidth metrics
      for (const [interfaceName, interfaceData] of Object.entries(bandwidthInfo.interfaces)) {
        // Create download/upload speed visualizations (arrows)
        let downloadArrow = '↓';
        if (interfaceData.rxSpeed > 1000) downloadArrow = '⬇️'; // More than 1 MB/s
        if (interfaceData.rxSpeed > 5000) downloadArrow = '⏬'; // More than 5 MB/s
        
        let uploadArrow = '↑';
        if (interfaceData.txSpeed > 1000) uploadArrow = '⬆️'; // More than 1 MB/s
        if (interfaceData.txSpeed > 5000) uploadArrow = '⏫'; // More than 5 MB/s
        
        // Format speeds with appropriate units
        let downloadSpeed = `${interfaceData.rxSpeed} KB/s`;
        let uploadSpeed = `${interfaceData.txSpeed} KB/s`;
        
        if (interfaceData.rxSpeed > 1024) {
          downloadSpeed = `${(interfaceData.rxSpeed / 1024).toFixed(2)} MB/s`;
        }
        
        if (interfaceData.txSpeed > 1024) {
          uploadSpeed = `${(interfaceData.txSpeed / 1024).toFixed(2)} MB/s`;
        }
        
        embed.addFields({
          name: `🌐 ${interfaceName}`,
          value: `${downloadArrow} Download: ${downloadSpeed}\n${uploadArrow} Upload: ${uploadSpeed}\nTotal Received: ${interfaceData.rxTotal}\nTotal Sent: ${interfaceData.txTotal}`,
          inline: true
        });
      }
      
      // Add explainer note
      embed.addFields({
        name: 'ℹ️ Information',
        value: 'Network speeds are measured in real-time over a 1-second interval. Run the command again to see updated speeds.',
        inline: false
      });
      
      // Add timestamp in footer
      embed.setFooter({
        text: `${branding.getFooter()} • Last updated: ${new Date().toLocaleTimeString()}`
      });
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error executing vpsBandwidth command:', error);
      
      // Create error embed with branding
      const errorEmbed = branding.getHeaderEmbed('Error Checking Bandwidth', 'danger');
      errorEmbed.setDescription(`${branding.emojis.error} An error occurred while checking VPS bandwidth.\n\`\`\`${error.message}\`\`\``);
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};