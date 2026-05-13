// backend/pangolinBranding.js
/**
 * Shared branding elements for Pangolin monitoring commands
 * This centralizes all styling for consistent look and feel
 */

module.exports = {
  // Main brand colors
  colors: {
    primary: 0x6C5CE7,      // Purple (main Pangolin color)
    success: 0x00D166,      // Green (for healthy status)
    warning: 0xFFA500,      // Orange (for warnings)
    danger: 0xED4245,       // Red (for critical issues)
    info: 0x3498DB,         // Blue (for informational displays)
    crowdsec: 0x5865F2      // CrowdSec's blue color
  },

  // CrowdSec logo thumbnail URL
  thumbnailUrl: 'https://cdn.jsdelivr.net/gh/selfhst/icons/png/pangolin.png', // Replace with your preferred CrowdSec logo

  // Common emojis for status indicators
  emojis: {
    healthy: '✅',
    warning: '⚠️',
    error: '❌',
    unknown: '❓',
    loading: '🔄',
    secured: '🔒',
    alert: '🚨',
    pangolin: '🦔',  // Pangolin mascot (closest emoji is hedgehog)
    gerbil: '🐹',    // Gerbil container  
    traefik: '🌐',   // For network/proxy
    crowdsec: '🛡️',  // For security
    pc: '🖥️'      // For system metrics
  },

  // Footer text for all embeds
  getFooter: () => {
    return `Pangolin Stack Monitor • ${new Date().toISOString().split('T')[0]}`;
  },

  // Standard header for console logs
  consoleHeader: '🦔 Pangolin Stack Monitor',

  // Format container name with appropriate emoji
  formatContainerName: (name) => {
    const emojis = {
      'pangolin': '🦔',
      'gerbil': '🐹',
      'traefik': '🌐',
      'crowdsec': '🛡️'
    };

    return `${emojis[name.toLowerCase()] || '📦'} ${name}`;
  },

  // Create a standard embed header with Pangolin branding
  getHeaderEmbed: (title, status = 'info') => {
    const { EmbedBuilder } = require('discord.js');
    const colors = module.exports.colors;

    // Map status to color
    const colorMap = {
      'success': colors.success,
      'warning': colors.warning,
      'danger': colors.danger,
      'info': colors.info,
      'crowdsec': colors.crowdsec,
      'primary': colors.primary
    };

    const embed = new EmbedBuilder()
      .setTitle(`🦔 ${title}`)
      .setColor(colorMap[status] || colors.primary)
      .setTimestamp()
      .setFooter({ text: module.exports.getFooter() });

    // Add thumbnail if URL is available
    if (module.exports.thumbnailUrl) {
      embed.setThumbnail(module.exports.thumbnailUrl);
    }
    return embed;
  }
};