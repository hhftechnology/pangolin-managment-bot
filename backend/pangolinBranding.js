// backend/crowdsecBranding.js
/**
 * Shared branding elements for CrowdSec monitoring commands
 * This centralizes all styling for consistent look and feel
 */

module.exports = {
  // Main brand colors
  colors: {
    primary: 0x5865F2,      // CrowdSec blue
    success: 0x00D166,      // Green (for healthy status)
    warning: 0xFFA500,      // Orange (for warnings)
    danger: 0xED4245,       // Red (for critical issues)
    info: 0x3498DB,         // Blue (for informational displays)
    crowdsec: 0x5865F2      // CrowdSec's blue color
  },
  
  // CrowdSec logo thumbnail URL
  thumbnailUrl: 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/crowdsec.svg', // Replace with your preferred CrowdSec logo
  
  // Common emojis for status indicators
  emojis: {
    healthy: '✅',
    warning: '⚠️',
    error: '❌',
    unknown: '❓',
    loading: '🔄',
    secured: '🔒',
    alert: '🚨',
    security: '🛡️',    // Main CrowdSec mascot
    firewall: '🧱',    // For firewall 
    traefik: '🌐',     // For network/proxy
    crowdsec: '🛡️'     // For security
  },
  
  // Footer text for all embeds
  getFooter: () => {
    return `CrowdSec Security Monitor • ${new Date().toISOString().split('T')[0]}`;
  },
  
  // Standard header for console logs
  consoleHeader: '🛡️ CrowdSec Security Monitor',
  
  // Format container name with appropriate emoji
  formatContainerName: (name) => {
    const emojis = {
      'crowdsec': '🛡️',
      'bouncers': '🧱',
      'traefik': '🌐',
      'agent': '🔍'
    };
    
    return `${emojis[name.toLowerCase()] || '📦'} ${name}`;
  },
  
  // Create a standard embed header with CrowdSec branding
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
    
    // Create embed with standard properties
    const embed = new EmbedBuilder()
      .setTitle(`🛡️ ${title}`)
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