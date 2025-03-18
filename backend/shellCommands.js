// backend/shellCommands.js
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

/**
 * Executes a shell command and returns the result
 * 
 * @param {string} command - The command to execute
 * @param {Object} options - Options for execution
 * @returns {Promise<Object>} - Result with stdout and stderr
 */
async function executeCommand(command, options = {}) {
  try {
    console.log(`Executing command: ${command}`);
    const { stdout, stderr } = await execPromise(command, {
      timeout: options.timeout || 30000, // 30 second default timeout
      maxBuffer: 1024 * 1024, // 1MB buffer
    });
    
    return {
      success: true,
      stdout,
      stderr
    };
  } catch (error) {
    console.error(`Command execution error: ${error.message}`);
    return {
      success: false,
      error: error.message,
      stdout: error.stdout,
      stderr: error.stderr
    };
  }
}

/**
 * CrowdSec specific commands
 */
const crowdsecCommands = {
  /**
   * Lists all active decisions (blocked IPs)
   */
  listDecisions: async () => {
    return executeCommand('docker exec crowdsec cscli decisions list -o human');
  },
  
  /**
   * Unbans an IP address
   * @param {string} ip - The IP address to unban
   */
  unbanIp: async (ip) => {
    // Sanitize IP to prevent command injection
    const sanitizedIp = ip.replace(/[;|&"`'$*()\\]/g, '');
    return executeCommand(`docker exec crowdsec cscli decisions delete --ip ${sanitizedIp}`);
  },
  
  /**
   * Whitelists an IP in CrowdSec
   * @param {string} ip - The IP address to whitelist
   */
  whitelistIpInCrowdsec: async (ip) => {
    // This is a simplified approach - in a real implementation you'd need to modify the whitelist.yaml file
    // For demonstration, we'll simulate this by creating a decision with type 'whitelist'
    const sanitizedIp = ip.replace(/[;|&"`'$*()\\]/g, '');
    return executeCommand(`docker exec crowdsec cscli decisions add --ip ${sanitizedIp} --type whitelist --duration 8760h`);
  },
  
  /**
   * Check if CrowdSec container is running
   */
  checkCrowdsecHealth: async () => {
    return executeCommand('docker ps --filter "name=crowdsec" --format "{{.Status}}"');
  }
};

/**
 * Traefik specific commands
 */
const traefikCommands = {
  /**
   * Check if Traefik container is running
   */
  checkTraefikHealth: async () => {
    return executeCommand('docker ps --filter "name=traefik" --format "{{.Status}}"');
  },
  
  /**
   * Restart Traefik container
   */
  restartTraefik: async () => {
    return executeCommand('docker restart traefik');
  }
};

/**
 * Stack health commands
 */
const stackCommands = {
  /**
   * Check health of all stack components
   */
  checkStackHealth: async () => {
    const containers = ['pangolin', 'gerbil', 'traefik', 'crowdsec'];
    const results = {};
    
    for (const container of containers) {
      results[container] = await executeCommand(`docker ps --filter "name=${container}" --format "{{.Status}}"`);
    }
    
    return results;
  }
};

module.exports = {
  executeCommand,
  crowdsecCommands,
  traefikCommands,
  stackCommands
};