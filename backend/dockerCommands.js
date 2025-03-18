// backend/dockerCommands.js
const Docker = require('node-docker-api').Docker;

// Initialize Docker client
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

/**
 * CrowdSec specific commands
 */
const crowdsecCommands = {
  /**
   * Lists all active decisions (blocked IPs)
   */
  listDecisions: async () => {
    try {
      // Find the CrowdSec container
      const containers = await docker.container.list({
        all: true,
        filters: { name: ['crowdsec'] }
      });
      
      if (containers.length === 0) {
        throw new Error('CrowdSec container not found');
      }
      
      const container = containers[0];
      
      // Check if container is running
      if (container.data.State !== 'running') {
        throw new Error('CrowdSec container is not running');
      }
      
      // Create an exec instance
      const exec = await container.exec.create({
        AttachStdout: true,
        AttachStderr: true,
        Cmd: ['cscli', 'decisions', 'list', '-o', 'human']
      });
      
      // Start the exec instance
      const stream = await exec.start();
      
      // Process the stream
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
            reject(new Error(errorOutput));
          } else {
            resolve({ success: true, stdout: output, stderr: errorOutput });
          }
        });
        
        stream.on('error', (error) => {
          reject(error);
        });
      });
    } catch (error) {
      console.error('Error listing decisions:', error);
      return { success: false, error: error.message };
    }
  },
  
  /**
   * Unbans an IP address
   * @param {string} ip - The IP address to unban
   */
  unbanIp: async (ip) => {
    try {
      // Find the CrowdSec container
      const containers = await docker.container.list({
        all: true,
        filters: { name: ['crowdsec'] }
      });
      
      if (containers.length === 0) {
        throw new Error('CrowdSec container not found');
      }
      
      const container = containers[0];
      
      // Check if container is running
      if (container.data.State !== 'running') {
        throw new Error('CrowdSec container is not running');
      }
      
      // Create an exec instance
      const exec = await container.exec.create({
        AttachStdout: true,
        AttachStderr: true,
        Cmd: ['cscli', 'decisions', 'delete', '--ip', ip]
      });
      
      // Start the exec instance
      const stream = await exec.start();
      
      // Process the stream
      return new Promise((resolve, reject) => {
        let output = '';
        let errorOutput = '';
        
        stream.on('data', (chunk) => {
          // Docker adds 8 bytes of header to each chunk
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
            reject(new Error(errorOutput));
          } else {
            resolve({ success: true, stdout: output, stderr: errorOutput });
          }
        });
        
        stream.on('error', (error) => {
          reject(error);
        });
      });
    } catch (error) {
      console.error('Error unbanning IP:', error);
      return { success: false, error: error.message };
    }
  },
  
  /**
   * Whitelists an IP in CrowdSec
   * @param {string} ip - The IP address to whitelist
   */
  whitelistIpInCrowdsec: async (ip) => {
    try {
      // Find the CrowdSec container
      const containers = await docker.container.list({
        all: true,
        filters: { name: ['crowdsec'] }
      });
      
      if (containers.length === 0) {
        throw new Error('CrowdSec container not found');
      }
      
      const container = containers[0];
      
      // Check if container is running
      if (container.data.State !== 'running') {
        throw new Error('CrowdSec container is not running');
      }
      
      // Create an exec instance - add to whitelist (simulated)
      const exec = await container.exec.create({
        AttachStdout: true,
        AttachStderr: true,
        Cmd: ['cscli', 'decisions', 'add', '--ip', ip, '--type', 'whitelist', '--duration', '8760h']
      });
      
      // Start the exec instance
      const stream = await exec.start();
      
      // Process the stream
      return new Promise((resolve, reject) => {
        let output = '';
        let errorOutput = '';
        
        stream.on('data', (chunk) => {
          // Docker adds 8 bytes of header to each chunk
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
            reject(new Error(errorOutput));
          } else {
            resolve({ success: true, stdout: output, stderr: errorOutput });
          }
        });
        
        stream.on('error', (error) => {
          reject(error);
        });
      });
    } catch (error) {
      console.error('Error whitelisting IP:', error);
      return { success: false, error: error.message };
    }
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
    const containerNames = ['pangolin', 'gerbil', 'traefik', 'crowdsec'];
    const results = {};
    
    try {
      // Get all containers
      const allContainers = await docker.container.list({ all: true });
      
      // Check each container
      for (const name of containerNames) {
        const container = allContainers.find(c => 
          c.data.Names.some(containerName => containerName.slice(1) === name)
        );
        
        if (container) {
          results[name] = {
            success: true,
            isRunning: container.data.State === 'running',
            status: container.data.Status,
            state: container.data.State
          };
        } else {
          results[name] = {
            success: false,
            isRunning: false,
            status: 'Container not found',
            state: 'missing'
          };
        }
      }
      
      return { success: true, results };
    } catch (error) {
      console.error('Error checking stack health:', error);
      return { success: false, error: error.message };
    }
  }
};

/**
 * Get current public IP
 */
async function getCurrentPublicIp() {
  try {
    // Create a container to run curl
    const container = await docker.container.create({
      Image: 'curlimages/curl:latest',
      Cmd: ['curl', '-s', 'ifconfig.me'],
      HostConfig: {
        AutoRemove: true
      }
    });
    
    // Start the container
    await container.start();
    
    // Wait for the container to finish
    await container.wait();
    
    // Get the logs (which will contain the IP)
    const logs = await container.logs({
      follow: false,
      stdout: true,
      stderr: true
    });
    
    return new Promise((resolve, reject) => {
      let output = '';
      
      logs.on('data', (chunk) => {
        output += chunk.toString();
      });
      
      logs.on('end', () => {
        const ip = output.trim();
        resolve({ success: true, ip });
      });
      
      logs.on('error', (error) => {
        reject(error);
      });
    });
  } catch (error) {
    console.error('Error getting public IP:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  crowdsecCommands,
  stackCommands,
  getCurrentPublicIp
};