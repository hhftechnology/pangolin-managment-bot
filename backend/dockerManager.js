// backend/dockerManager.js
const Docker = require('node-docker-api').Docker;
const branding = require('./pangolinBranding');

// Initialize Docker client using the socket
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

/**
 * Get detailed status for a container including uptime, CPU and memory stats
 * @param {string} containerName - Name of the container
 */
async function getContainerDetailedStatus(containerName) {
  try {
    // List all containers (including non-running ones)
    const containers = await docker.container.list({ all: true });
    
    // Find container by name (handle slash prefix in container names)
    const container = containers.find(c => 
      c.data.Names.some(name => name === `/${containerName}` || name.slice(1) === containerName)
    );
    
    if (!container) {
      return { 
        success: true, 
        exists: false, 
        running: false,
        status: 'not found'
      };
    }
    
    const result = {
      success: true,
      exists: true,
      running: container.data.State === 'running',
      status: container.data.Status,
      state: container.data.State,
      id: container.data.Id
    };
    
    // Extract uptime from status (format: "Up 20 hours")
    try {
      const uptimeMatch = container.data.Status.match(/Up (\d+) (\w+)/);
      if (uptimeMatch) {
        result.uptime = `${uptimeMatch[1]} ${uptimeMatch[2]}`;
      } else {
        result.uptime = 'N/A';
      }
    } catch (e) {
      result.uptime = 'Unknown';
    }
    
    // Get stats for running containers
    if (result.running) {
      try {
        const stats = await container.stats({ stream: false });
        result.cpu = '0.00%'; // Simplified - accurate CPU calculation is complex
        result.memory = 'Unknown';
        
        // Safety checks for memory stats
        if (stats && stats.memory_stats && stats.memory_stats.usage) {
          result.memory = formatBytes(stats.memory_stats.usage);
        }
      } catch (e) {
        console.error(`Error getting stats for ${containerName}:`, e.message);
        result.cpu = '0.00%';
        result.memory = 'Unknown';
      }
    } else {
      result.cpu = '0.00%';
      result.memory = 'Unknown';
    }
    
    return result;
  } catch (error) {
    console.error(`Error checking container ${containerName}:`, error.message);
    return { 
      success: false, 
      error: error.message,
      running: false,
      cpu: '0.00%',
      memory: 'Unknown',
      uptime: 'Unknown'
    };
  }
}

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes) {
  if (bytes === 0 || bytes === undefined) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Execute a command in a container
 * @param {string} containerName - Name of the container
 * @param {string[]} cmd - Command to execute
 */
async function executeInContainer(containerName, cmd) {
  try {
    console.log(`Executing in ${containerName}: ${cmd.join(' ')}`);
    
    // Get container by name
    const container = await docker.container.list({
      all: true,
      filters: { name: [containerName] }
    });
    
    if (container.length === 0) {
      return { success: false, error: `Container ${containerName} not found` };
    }
    
    if (container[0].data.State !== 'running') {
      return { success: false, error: `Container ${containerName} is not running` };
    }
    
    // Create exec instance
    const exec = await container[0].exec.create({
      AttachStdout: true,
      AttachStderr: true,
      Cmd: cmd
    });
    
    // Start exec instance
    const stream = await exec.start();
    
    // Collect output
    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';
      
      stream.on('data', (chunk) => {
        // Docker adds 8 bytes of header to each chunk
        // First byte is stream type (1 = stdout, 2 = stderr)
        const streamType = chunk[0];
        const data = chunk.slice(8).toString();
        
        if (streamType === 1) {
          output += data;
        } else if (streamType === 2) {
          errorOutput += data;
        }
      });
      
      stream.on('end', () => {
        if (errorOutput && !output) {
          resolve({ success: false, error: errorOutput, stdout: '', stderr: errorOutput });
        } else {
          resolve({ success: true, stdout: output, stderr: errorOutput });
        }
      });
      
      stream.on('error', (error) => {
        reject({ success: false, error: error.message });
      });
    });
  } catch (error) {
    console.error(`Error executing in container ${containerName}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Check health of all components in the stack
 */
async function checkStackHealth() {
  try {
    const containerNames = ['pangolin', 'gerbil', 'traefik', 'crowdsec'];
    const results = {};
    
    // Check each container with detailed stats
    for (const name of containerNames) {
      results[name] = await getContainerDetailedStatus(name);
    }
    
    return { success: true, results };
  } catch (error) {
    console.error('Error checking stack health:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * CrowdSec specific operations
 */
const crowdsec = {
  /**
   * List active decisions
   */
  listDecisions: async () => {
    return executeInContainer('crowdsec', ['cscli', 'decisions', 'list', '-o', 'human']);
  },
  
  /**
   * Unban an IP
   * @param {string} ip - IP address to unban
   */
  unbanIp: async (ip) => {
    return executeInContainer('crowdsec', ['cscli', 'decisions', 'delete', '--ip', ip]);
  },
  
  /**
   * Whitelist an IP
   * @param {string} ip - IP address to whitelist
   */
  whitelistIp: async (ip) => {
    return executeInContainer('crowdsec', ['cscli', 'decisions', 'add', '--ip', ip, '--type', 'whitelist', '--duration', '8760h']);
  }
};

/**
 * Get the current public IP using an ephemeral container
 */
async function getPublicIp() {
  try {
    // Find a running container to use for curl
    const containers = await docker.container.list({
      filters: { status: ['running'] }
    });
    
    if (containers.length === 0) {
      return { success: false, error: "No running containers available" };
    }
    
    // Use the first available container
    const container = containers[0];
    
    // Execute curl command
    const exec = await container.exec.create({
      AttachStdout: true,
      AttachStderr: true,
      Cmd: ['curl', '-s', 'ifconfig.me']
    });
    
    // Start the exec instance
    const stream = await exec.start();
    
    // Collect output
    return new Promise((resolve, reject) => {
      let output = '';
      
      stream.on('data', (chunk) => {
        // Remove header bytes
        const data = chunk.slice(8).toString();
        output += data;
      });
      
      stream.on('end', () => {
        const ip = output.trim();
        resolve({ success: true, ip });
      });
      
      stream.on('error', (error) => {
        reject({ success: false, error: error.message });
      });
    });
  } catch (error) {
    console.error('Error getting public IP:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  executeInContainer,
  getContainerDetailedStatus,
  checkStackHealth,
  crowdsec,
  getPublicIp
};